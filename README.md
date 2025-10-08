# Servarr Stack

Complete media automation suite with Prometheus metrics support via Exportarr sidecars.

## Components

### Core Infrastructure
- **PostgreSQL Database**: Shared database for all *arr applications (except qBittorrent)
- **Shared Media Storage**: 2TB NFS volume for all media files  
- **Downloads Storage**: 500GB NFS volume for torrent downloads
- **qBittorrent Config Storage**: Dedicated config PVC for qBittorrent only

### Applications

| Service | Port | Purpose | Exportarr Port |
|---------|------|---------|----------------|
| **qBittorrent** | 8080 | Torrent download client | - |
| **Prowlarr** | 9696 | Indexer management hub | 9707 |
| **Sonarr** | 8989 | TV show automation | 9708 |
| **Radarr** | 7878 | Movie automation | 9709 |
| **Lidarr** | 8686 | Music automation | 9710 |
| **Readarr** | 8787 | Book/audiobook automation | 9711 |
| **Bazarr** | 6767 | Subtitle management | 9712 |
| **Jellyseerr** | 5055 | Request management UI | - |

## Environment Variables

PostgreSQL connection details can be configured via environment variables (with fallbacks to Pulumi config):

```bash
export SERVARR_POSTGRES_HOST=postgresql.servarr.svc.cluster.local
export SERVARR_POSTGRES_PORT=5432
export SERVARR_POSTGRES_USER=servarr
export SERVARR_POSTGRES_PASSWORD=your-secure-password
export SERVARR_POSTGRES_DATABASE=servarr
```

## Post-Deployment Setup

### 1. PostgreSQL Database Setup
Ensure PostgreSQL is deployed with a database for Servarr apps:

```sql
CREATE DATABASE servarr;
CREATE USER servarr WITH PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE servarr TO servarr;
```

### 2. Initial Configuration
After deployment, each app needs initial setup:

1. Access each service via port-forward:
   ```bash
   kubectl port-forward -n servarr svc/prowlarr 9696:9696
   ```

2. Complete initial setup wizard for each app (they'll automatically use PostgreSQL)

3. Retrieve API keys from each app's settings

### 3. Update API Key Secrets
Replace placeholder secrets with actual API keys:

```bash
# Example for Sonarr
kubectl create secret generic sonarr-apikey \
  --from-literal=apikey=YOUR_ACTUAL_API_KEY \
  --namespace servarr \
  --dry-run=client -o yaml | kubectl apply -f -
```

### 4. Configure Connections

#### Prowlarr → Apps
1. In Prowlarr, add each app under Settings → Apps
2. Use service names for internal communication (e.g., `http://sonarr:8989`)

#### Apps → qBittorrent
1. In each *arr app, configure download client
2. Host: `qbittorrent`
3. Port: `8080`

#### Sonarr/Radarr → Bazarr
1. In Bazarr, configure Sonarr/Radarr connections
2. Use internal service names

### 5. Media Folder Structure
Recommended structure in `/media`:
```
/media/
├── movies/
├── tv/
├── music/
├── books/
├── audiobooks/
└── downloads/
    ├── complete/
    └── incomplete/
```

## Monitoring

All *arr applications (except qBittorrent and Jellyseerr) have Exportarr sidecars that expose Prometheus metrics on their respective ports.

Configure Prometheus to scrape these endpoints:
```yaml
- job_name: 'servarr'
  kubernetes_sd_configs:
  - role: service
    namespaces:
      names:
      - servarr
  relabel_configs:
  - source_labels: [__meta_kubernetes_service_annotation_prometheus_io_scrape]
    action: keep
    regex: true
```

## Troubleshooting

### Check logs
```bash
kubectl logs -n servarr deployment/sonarr
kubectl logs -n servarr deployment/sonarr -c exportarr  # For sidecar
```

### Verify storage
```bash
kubectl get pvc -n servarr
```

### Test internal connectivity
```bash
kubectl exec -n servarr deployment/sonarr -- curl http://prowlarr:9696/api/v1/health
```