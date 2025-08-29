import { config, Namespace, Secret } from '@homelab/shared'
import { PersistentVolume, PersistentVolumeClaim } from '@pulumi/kubernetes/core/v1'
import { Database, Provider } from '@pulumi/postgresql'
import { createServarrPvcConfig, NAMESPACE } from './components/base'
import { bazarr } from './components/bazarr'
import { jellyseerr } from './components/jellyseerr'
import { lazylibrarian } from './components/lazylibrarian'
import { lidarr } from './components/lidarr'
import { prowlarr } from './components/prowlarr'
// Import all Servarr applications
import { qbittorrent } from './components/qbittorrent'
import { radarr } from './components/radarr'
import { sonarr } from './components/sonarr'

// Create namespace (components will use this via their shared namespace reference)
const ns = new Namespace('servarr', {
  metadata: { name: NAMESPACE },
})

// Create servarr-specific media PV pointing to the same NFS share as jellyfin
const cfg = config('servarr')
const mediaPV = new PersistentVolume('servarr-media-pv', {
  metadata: { name: 'servarr-media-pv' },
  spec: {
    capacity: { storage: cfg.get('mediaSize', '500Gi') },
    accessModes: ['ReadWriteMany'],
    persistentVolumeReclaimPolicy: 'Retain',
    storageClassName: cfg.get('storageClass', 'truenas-hdd-stripe-nfs'),
    nfs: {
      server: process.env.TRUENAS_HOST || 'localhost', // TrueNAS NFS server (shared with democratic-csi)
      path: process.env.TRUENAS_NFS_PATH_MEDIA || '/path/to/media', // 47TB media collection
    },
  },
})

const _mediaPVC = new PersistentVolumeClaim(
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

// Create config PVC for LazyLibrarian (uses SQLite, needs persistent storage)
const _lazyLibrarianConfigPVC = new PersistentVolumeClaim(
  'lazylibrarian-config',
  createServarrPvcConfig('lazylibrarian', cfg.get('configSize', '2Gi')),
  { dependsOn: [ns] },
)

// PostgreSQL secret for database password
new Secret(
  'postgres-secret',
  {
    metadata: {
      name: 'postgres-secret',
      namespace: NAMESPACE,
    },
    stringData: {
      password: process.env.POSTGRES_PASSWORD || 'defaultpassword',
    },
  },
  { dependsOn: [ns] },
)

// PostgreSQL provider configuration
const postgresProvider = new Provider('postgres-provider', {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  username: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'defaultpassword',
  sslmode: 'disable',
})

// Create database for Servarr applications
new Database(
  'servarr-database',
  {
    name: 'servarr',
    owner: process.env.POSTGRES_USER || 'postgres',
  },
  { provider: postgresProvider },
)

// Create API key secrets based on environment variables
;['prowlarr', 'sonarr', 'radarr', 'lidarr', 'lazylibrarian', 'bazarr'].map((app) => {
  const apiKey = process.env[`${app.toUpperCase()}_APIKEY`]

  return new Secret(
    `${app}-apikey`,
    {
      metadata: {
        name: `${app}-apikey`,
        namespace: NAMESPACE,
      },
      stringData: {
        apikey: apiKey && apiKey.trim() !== '' ? apiKey : 'PLACEHOLDER_WILL_BE_SET_AFTER_DEPLOYMENT',
      },
    },
    { dependsOn: [ns] },
  )
})

// Export useful information
export const namespace = ns.metadata.name
export const services = {
  qbittorrent: qbittorrent.service?.metadata.name,
  prowlarr: prowlarr.service?.metadata.name,
  sonarr: sonarr.service?.metadata.name,
  radarr: radarr.service?.metadata.name,
  lidarr: lidarr.service?.metadata.name,
  lazylibrarian: lazylibrarian.service?.metadata.name,
  bazarr: bazarr.service?.metadata.name,
  jellyseerr: jellyseerr.service?.metadata.name,
}
