import { App, PersistentVolumeClaim } from '@homelab/shared'
import { createServarrAppConfig, createServarrPvcConfig } from './base'

// qBittorrent config PVC
const qbittorrentConfigPvc = new PersistentVolumeClaim(
  'qbittorrent-config',
  createServarrPvcConfig('qbittorrent', '5Gi'),
)

// qBittorrent app (no exportarr support)
export const qbittorrent = new App(
  'qbittorrent',
  createServarrAppConfig(
    'qbittorrent',
    process.env.QBITTORRENT_IMAGE || 'lscr.io/linuxserver/qbittorrent:latest',
    8080,
    {
      resources: {
        requests: { cpu: '200m', memory: '512Mi' },
        limits: { cpu: '2', memory: '4Gi' },
      },
      env: [{ name: 'WEBUI_PORT', value: '8080' }],
    },
  ),
  { dependsOn: [qbittorrentConfigPvc] },
)
