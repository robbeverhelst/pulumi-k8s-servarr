import { App } from '@homelab/shared'
import { createServarrAppConfig } from './base'

// Jellyseerr app with PostgreSQL (no exportarr support)
export const jellyseerr = new App(
  'jellyseerr',
  createServarrAppConfig('jellyseerr', process.env.JELLYSEERR_IMAGE || 'fallenbagel/jellyseerr:latest', 5055, {
    usePostgres: true,
    env: [{ name: 'LOG_LEVEL', value: 'info' }],
  }),
)
