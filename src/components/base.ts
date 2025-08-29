import type { AppConfig, SidecarConfig } from '@homelab/shared'
import { config } from '@homelab/shared'

const cfg = config('servarr')

// Shared namespace name
export const NAMESPACE = cfg.get('namespace', 'servarr')

// Helper to create servarr app config with consistent defaults
export function createServarrAppConfig(
  name: string,
  image: string,
  port: number,
  options: {
    usePostgres?: boolean
    configSize?: string
    resources?: { requests?: { cpu: string; memory: string }; limits?: { cpu: string; memory: string } }
    env?: Array<{ name: string; value: string }>
  } = {},
): AppConfig {
  const baseEnv = [
    { name: 'PUID', value: '1000' },
    { name: 'PGID', value: '1000' },
    { name: 'TZ', value: cfg.get('timezone', 'Europe/Brussels') },
    ...(options.env || []),
  ]

  // Add PostgreSQL environment variables if enabled
  if (options.usePostgres) {
    baseEnv.push(
      {
        name: 'POSTGRES_HOST',
        value: process.env.POSTGRES_HOST || 'localhost',
      },
      {
        name: 'POSTGRES_PORT',
        value: process.env.POSTGRES_PORT || '5432',
      },
      {
        name: 'POSTGRES_USER',
        value: process.env.POSTGRES_USER || 'postgres',
      },
      {
        name: 'POSTGRES_PASSWORD',
        valueFrom: {
          secretKeyRef: {
            name: 'postgres-secret',
            key: 'password',
          },
        },
      } as any,
    )
  }

  // Configure volumes and mounts based on PostgreSQL usage
  // Using existing media PVC with subpaths
  const volumes = [{ name: 'media', type: 'pvc' as const, source: 'media' }]
  const volumeMounts = [
    { name: 'media', mountPath: '/media', subPath: 'media' },
    { name: 'media', mountPath: '/downloads', subPath: 'downloads' },
  ]

  // Add config PVC only if not using PostgreSQL
  if (!options.usePostgres) {
    volumes.push({ name: 'config', type: 'pvc' as const, source: `${name}-config` })
    volumeMounts.push({ name: 'config', mountPath: '/config', subPath: '' })
  }

  return {
    namespace: NAMESPACE,
    image,
    ports: [{ name: 'http', containerPort: port, servicePort: port }],
    env: baseEnv,
    resources: options.resources || {
      requests: { cpu: '100m', memory: '256Mi' },
      limits: { cpu: '1', memory: '2Gi' },
    },
    volumes,
    volumeMounts,
    deploymentStrategy: 'Recreate',
    serviceType: 'LoadBalancer',
  }
}

// Helper to create exportarr sidecar
export function createExportarrSidecar(appName: string, appPort: number, exportarrPort: number = 9707): SidecarConfig {
  return {
    name: 'exportarr',
    image: process.env.EXPORTARR_IMAGE || 'ghcr.io/onedr0p/exportarr:v2.0',
    args: [appName],
    env: [
      { name: 'PORT', value: String(exportarrPort) },
      { name: 'URL', value: `http://localhost:${appPort}` },
      {
        name: 'APIKEY',
        valueFrom: {
          secretKeyRef: {
            name: `${appName}-apikey`,
            key: 'apikey',
          },
        },
      },
    ],
    ports: [{ containerPort: exportarrPort, name: 'metrics' }],
    resources: {
      requests: { cpu: '10m', memory: '32Mi' },
      limits: { cpu: '100m', memory: '128Mi' },
    },
  }
}

// Helper to check if an API key is provided (not placeholder)
export function hasApiKey(appName: string): boolean {
  const apiKey = process.env[`${appName.toUpperCase()}_APIKEY`]
  return !!(apiKey && apiKey !== 'PLACEHOLDER_WILL_BE_SET_AFTER_DEPLOYMENT' && apiKey.trim() !== '')
}

// Helper to get conditional exportarr sidecar and annotations
export function getExportarrConfig(appName: string, appPort: number, exportarrPort: number = 9707) {
  if (!hasApiKey(appName)) {
    return {
      sidecars: undefined,
      serviceAnnotations: undefined,
    }
  }

  return {
    sidecars: [createExportarrSidecar(appName, appPort, exportarrPort)],
    serviceAnnotations: {
      'prometheus.io/scrape': 'true',
      'prometheus.io/port': String(exportarrPort),
      'prometheus.io/path': '/metrics',
    },
  }
}

// Helper to create PVC for servarr apps
export function createServarrPvcConfig(name: string, size: string = '10Gi') {
  return {
    metadata: { name: `${name}-config`, namespace: NAMESPACE },
    spec: {
      accessModes: ['ReadWriteOnce' as const],
      storageClassName: cfg.get('storageClass', 'truenas-hdd-mirror-nfs'),
      resources: { requests: { storage: size } },
    },
  }
}
