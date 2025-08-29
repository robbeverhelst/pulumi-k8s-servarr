import { App } from '@homelab/shared'
import { createServarrAppConfig, getExportarrConfig } from './base'

const exportarrConfig = getExportarrConfig('lidarr', 8686, 9710)

// Lidarr app with PostgreSQL and conditional exportarr sidecar
export const lidarr = new App('lidarr', {
  ...createServarrAppConfig('lidarr', process.env.LIDARR_IMAGE || 'lscr.io/linuxserver/lidarr:latest', 8686, {
    usePostgres: true,
  }),
  sidecars: exportarrConfig.sidecars,
  serviceAnnotations: exportarrConfig.serviceAnnotations,
})
