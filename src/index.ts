import * as fs from 'node:fs'
import * as path from 'node:path'
import { config, Namespace } from '@homelab/shared'
import { PersistentVolume, PersistentVolumeClaim } from '@pulumi/kubernetes/core/v1'
import { Chart, type ChartOpts } from '@pulumi/kubernetes/helm/v3'
import { Database, Provider } from '@pulumi/postgresql'
import { jellyseerr } from './components/jellyseerr'

const cfg = config('servarr')
const NAMESPACE = cfg.get('namespace', 'servarr')

const ns = new Namespace('servarr', {
  metadata: { name: NAMESPACE },
})

const mediaPV = new PersistentVolume('servarr-media-pv', {
  metadata: { name: 'servarr-media-pv' },
  spec: {
    capacity: { storage: cfg.get('mediaSize', '500Gi') },
    accessModes: ['ReadWriteMany'],
    persistentVolumeReclaimPolicy: 'Retain',
    storageClassName: cfg.get('storageClass', 'truenas-hdd-stripe-nfs'),
    nfs: {
      server: process.env.TRUENAS_HOST || 'localhost',
      path: process.env.TRUENAS_NFS_PATH_MEDIA || '/path/to/media',
    },
  },
})

const postgresProvider = new Provider('postgres-provider', {
  host: process.env.POSTGRES_HOST!,
  port: parseInt(process.env.POSTGRES_PORT!, 10),
  username: process.env.POSTGRES_USER!,
  password: process.env.POSTGRES_PASSWORD!,
  sslmode: 'disable',
})

const servarrApps = ['radarr', 'sonarr', 'prowlarr']
servarrApps.forEach((app) => {
  new Database(
    `${app}-main-database`,
    {
      name: `${app}-main`,
      owner: process.env.POSTGRES_USER || 'postgres',
    },
    { provider: postgresProvider },
  )

  new Database(
    `${app}-log-database`,
    {
      name: `${app}-log`,
      owner: process.env.POSTGRES_USER || 'postgres',
    },
    { provider: postgresProvider },
  )
})

new Database(
  'jellyseerr-database',
  {
    name: 'jellyseerr',
    owner: process.env.POSTGRES_USER || 'postgres',
  },
  { provider: postgresProvider },
)

function loadPreparrConfig(appName: string, apiKey: string) {
  const configPath = path.join(__dirname, '..', 'configs', `${appName}.json`)
  const configContent = fs.readFileSync(configPath, 'utf8')
  const config = JSON.parse(configContent)
  config.apiKey = apiKey

  if (appName === 'prowlarr' && config.applications) {
    config.applications.forEach((app: any) => {
      if (app.fields) {
        app.fields.forEach((field: any) => {
          if (field.name === 'apiKey') {
            if (app.name === 'Sonarr') {
              field.value = process.env.SONARR_APIKEY!
            } else if (app.name === 'Radarr') {
              field.value = process.env.RADARR_APIKEY!
            }
          }
        })
      }
    })
  }

  return config
}

function createExportarrContainer(appName: string, appPort: number, metricsPort: number, apiKey: string) {
  return {
    name: 'exportarr',
    image: process.env.EXPORTARR_IMAGE!,
    args: [appName],
    env: [
      { name: 'PORT', value: String(metricsPort) },
      { name: 'URL', value: `http://localhost:${appPort}` },
      { name: 'APIKEY', value: apiKey },
    ],
    ports: [{ containerPort: metricsPort, name: 'metrics' }],
    resources: {
      requests: { cpu: '10m', memory: '32Mi' },
      limits: { cpu: '100m', memory: '128Mi' },
    },
  }
}

const helmChartValues = {
  global: {
    namespace: NAMESPACE,
    timezone: cfg.get('timezone', 'Europe/Brussels'),
  },

  preparr: {
    enabled: true,
    image: {
      repository: process.env.PREPARR_IMAGE?.split(':')[0] || 'ghcr.io/robbeverhelst/preparr',
      tag: process.env.PREPARR_IMAGE?.split(':')[1] || '0.3.2',
    },
  },

  postgresql: {
    enabled: false,
    externalHost: process.env.POSTGRES_HOST!,
    auth: {
      username: process.env.POSTGRES_USER!,
      password: process.env.POSTGRES_PASSWORD!,
      database: 'servarr',
    },
    service: {
      port: parseInt(process.env.POSTGRES_PORT!, 10),
    },
  },

  qbittorrent: {
    enabled: true,
    image: {
      repository: process.env.QBITTORRENT_IMAGE?.split(':')[0] || 'lscr.io/linuxserver/qbittorrent',
      tag: process.env.QBITTORRENT_IMAGE?.split(':')[1] || 'latest',
    },
    service: {
      type: 'LoadBalancer',
      webui: { port: 8080 },
      bittorrent: { port: 6881 },
      annotations: {
        'prometheus.io/scrape': 'true',
        'prometheus.io/port': '9711',
        'prometheus.io/path': '/metrics',
      },
    },
    ingress: {
      enabled: true,
      className: 'cloudflare-tunnel',
      hosts: [
        {
          host: 'qbittorrent.robbe.work',
          paths: [{ path: '/', pathType: 'Prefix' }],
        },
      ],
    },
    storage: {
      downloads: {
        enabled: true,
        existingClaim: 'media',
        subPath: 'downloads',
      },
    },
    config: {
      username: process.env.QBITTORRENT_USERNAME!,
      password: process.env.QBITTORRENT_PASSWORD!,
    },
    extraContainers: [createExportarrContainer('qbittorrent', 8080, 9711, process.env.QBITTORRENT_APIKEY!)],
  },

  prowlarr: {
    enabled: true,
    image: {
      repository: process.env.PROWLARR_IMAGE?.split(':')[0] || 'lscr.io/linuxserver/prowlarr',
      tag: process.env.PROWLARR_IMAGE?.split(':')[1] || 'latest',
    },
    service: {
      type: 'LoadBalancer',
      port: 9696,
      annotations: {
        'prometheus.io/scrape': 'true',
        'prometheus.io/port': '9707',
        'prometheus.io/path': '/metrics',
      },
    },
    ingress: {
      enabled: true,
      className: 'cloudflare-tunnel',
      hosts: [
        {
          host: 'prowlarr.robbe.work',
          paths: [{ path: '/', pathType: 'Prefix' }],
        },
      ],
    },
    config: loadPreparrConfig('prowlarr', process.env.PROWLARR_APIKEY!),
    adminPassword: process.env.PROWLARR_PASSWORD!,
    extraContainers: [createExportarrContainer('prowlarr', 9696, 9707, process.env.PROWLARR_APIKEY!)],
  },

  sonarr: {
    enabled: true,
    image: {
      repository: process.env.SONARR_IMAGE?.split(':')[0] || 'lscr.io/linuxserver/sonarr',
      tag: process.env.SONARR_IMAGE?.split(':')[1] || 'latest',
    },
    service: {
      type: 'LoadBalancer',
      port: 8989,
      annotations: {
        'prometheus.io/scrape': 'true',
        'prometheus.io/port': '9708',
        'prometheus.io/path': '/metrics',
      },
    },
    ingress: {
      enabled: true,
      className: 'cloudflare-tunnel',
      hosts: [
        {
          host: 'sonarr.robbe.work',
          paths: [{ path: '/', pathType: 'Prefix' }],
        },
      ],
    },
    storage: {
      tv: {
        enabled: true,
        existingClaim: 'media',
        subPath: 'media/tv',
      },
    },
    config: loadPreparrConfig('sonarr', process.env.SONARR_APIKEY!),
    adminPassword: process.env.SONARR_PASSWORD!,
    extraContainers: [createExportarrContainer('sonarr', 8989, 9708, process.env.SONARR_APIKEY!)],
  },

  radarr: {
    enabled: true,
    image: {
      repository: process.env.RADARR_IMAGE?.split(':')[0] || 'lscr.io/linuxserver/radarr',
      tag: process.env.RADARR_IMAGE?.split(':')[1] || 'latest',
    },
    service: {
      type: 'LoadBalancer',
      port: 7878,
      annotations: {
        'prometheus.io/scrape': 'true',
        'prometheus.io/port': '9709',
        'prometheus.io/path': '/metrics',
      },
    },
    ingress: {
      enabled: true,
      className: 'cloudflare-tunnel',
      hosts: [
        {
          host: 'radarr.robbe.work',
          paths: [{ path: '/', pathType: 'Prefix' }],
        },
      ],
    },
    storage: {
      movies: {
        enabled: true,
        existingClaim: 'media',
        subPath: 'media/movies',
      },
    },
    config: loadPreparrConfig('radarr', process.env.RADARR_APIKEY!),
    adminPassword: process.env.RADARR_PASSWORD!,
    extraContainers: [createExportarrContainer('radarr', 7878, 9709, process.env.RADARR_APIKEY!)],
  },

  lidarr: {
    enabled: false,
  },
}

new PersistentVolumeClaim(
  'media',
  {
    metadata: { name: 'media', namespace: NAMESPACE },
    spec: {
      accessModes: ['ReadWriteMany'],
      storageClassName: cfg.get('storageClass', 'truenas-hdd-stripe-nfs'),
      resources: { requests: { storage: cfg.get('mediaSize', '500Gi') } },
      volumeName: 'servarr-media-pv',
    },
  },
  { dependsOn: [ns, mediaPV] },
)

const chartOpts: ChartOpts = {
  chart: 'preparr',
  version: process.env.PREPARR_HELM_VERSION || '0.3.2',
  fetchOpts: {
    repo: 'https://robbeverhelst.github.io/Preparr',
  },
  namespace: NAMESPACE,
  values: helmChartValues,
}

new Chart('preparr', chartOpts, { dependsOn: [ns, mediaPV] })

export const namespace = ns.metadata.name
export const services = {
  jellyseerr: jellyseerr.service?.metadata.name,
}
