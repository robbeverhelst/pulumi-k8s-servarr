import { App } from '@homelab/shared'
import { createServarrAppConfig, getExportarrConfig } from './base'

const exportarrConfig = getExportarrConfig('radarr', 7878, 9709)

// Radarr app with PostgreSQL and conditional exportarr sidecar
export const radarr = new App('radarr', {
  ...createServarrAppConfig('radarr', process.env.RADARR_IMAGE || 'lscr.io/linuxserver/radarr:latest', 7878, {
    usePostgres: true,
  }),
  sidecars: exportarrConfig.sidecars,
  serviceAnnotations: exportarrConfig.serviceAnnotations,
})
