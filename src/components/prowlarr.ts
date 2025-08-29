import { App } from '@homelab/shared'
import { createServarrAppConfig, getExportarrConfig } from './base'

const exportarrConfig = getExportarrConfig('prowlarr', 9696, 9707)

// Prowlarr app with PostgreSQL and conditional exportarr sidecar
export const prowlarr = new App('prowlarr', {
  ...createServarrAppConfig('prowlarr', process.env.PROWLARR_IMAGE || 'lscr.io/linuxserver/prowlarr:latest', 9696, {
    usePostgres: true,
  }),
  sidecars: exportarrConfig.sidecars,
  serviceAnnotations: exportarrConfig.serviceAnnotations,
})
