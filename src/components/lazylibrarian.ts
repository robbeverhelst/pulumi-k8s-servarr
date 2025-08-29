import { App } from '@homelab/shared'
import { createServarrAppConfig, getExportarrConfig } from './base'

const exportarrConfig = getExportarrConfig('lazylibrarian', 5299, 9713)

// LazyLibrarian app for ebook and audiobook management
export const lazylibrarian = new App('lazylibrarian', {
  ...createServarrAppConfig(
    'lazylibrarian',
    process.env.LAZYLIBRARIAN_IMAGE || 'lscr.io/linuxserver/lazylibrarian:latest',
    5299,
    {
      usePostgres: false, // LazyLibrarian doesn't support PostgreSQL, uses SQLite
    },
  ),
  sidecars: exportarrConfig.sidecars,
  serviceAnnotations: exportarrConfig.serviceAnnotations,
})
