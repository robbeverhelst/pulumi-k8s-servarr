import { App } from '@homelab/shared'
import { createServarrAppConfig, getExportarrConfig } from './base'

const exportarrConfig = getExportarrConfig('sonarr', 8989, 9708)

// Sonarr app with PostgreSQL and conditional exportarr sidecar
export const sonarr = new App('sonarr', {
  ...createServarrAppConfig('sonarr', process.env.SONARR_IMAGE || 'lscr.io/linuxserver/sonarr:latest', 8989, {
    usePostgres: true,
  }),
  sidecars: exportarrConfig.sidecars,
  serviceAnnotations: exportarrConfig.serviceAnnotations,
})
