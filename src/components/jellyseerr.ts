import { App } from '@homelab/shared'
import { Ingress } from '@pulumi/kubernetes/networking/v1'
import { createServarrAppConfig, NAMESPACE } from './base'

export const jellyseerr = new App(
  'jellyseerr',
  createServarrAppConfig('jellyseerr', process.env.JELLYSEERR_IMAGE!, 5055, {
    env: [{ name: 'LOG_LEVEL', value: 'info' }],
  }),
  {},
)

export const jellyseerrIngress = new Ingress(
  'jellyseerr-ingress',
  {
    metadata: {
      name: 'jellyseerr',
      namespace: NAMESPACE,
    },
    spec: {
      ingressClassName: 'cloudflare-tunnel',
      rules: [
        {
          host: 'jellyseerr.robbe.work',
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: 'jellyseerr',
                    port: { number: 5055 },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  },
  { dependsOn: [jellyseerr] },
)
