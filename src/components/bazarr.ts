import { App } from '@homelab/shared'
import { createServarrAppConfig, getExportarrConfig } from './base'

const exportarrConfig = getExportarrConfig('bazarr', 6767, 9712)

// Bazarr app with PostgreSQL and conditional exportarr sidecar
export const bazarr = new App('bazarr', {
  ...createServarrAppConfig('bazarr', process.env.BAZARR_IMAGE || 'lscr.io/linuxserver/bazarr:latest', 6767, {
    usePostgres: true,
  }),
  sidecars: exportarrConfig.sidecars,
  serviceAnnotations: exportarrConfig.serviceAnnotations,
})
