# Sheet Folio

A sheet music manager with a web UI accessible from both PC and iPad. The interface is available in Chinese (zh-CN) and English (en-US), but the data model supports arbitrary languages via primary and alternate name fields - designed for easy extension beyond the two currently implemented UI languages.

App features: browse, search, and sort a directory of pieces; upload, delete, and reorder sheet images; color-coded difficulty/technique/pitch/rhythm tags; scroll and page-flip sheet views; per-device zoom persistence and favorate pieces; sheet source and video link management; full CRUD.

## Quick Start

### Option 1: Docker Compose

```bash
git clone <repo>
cd sheet-folio
docker compose up -d

# To rebuild after code changes: 
docker compose up -d --build
```

Open `http://localhost:8888` in your browser. Stop with `docker compose down`. Data persists in Docker volumes. 

> **Note:** If running inside WSL2, add the below to `%USERPROFILE%\.wslconfig`:
> ```ini
> [wsl2]
> networkingMode=mirrored
> firewall=false
> ```
> Then restart WSL2 with `wsl --shutdown`, reopen your WSL2 terminal, and start docker.

## License

[AGPLv3](LICENSE) — you may use, modify, and distribute this software freely,
but if you run it as a network service or distribute modified versions, you
must make your changes available under the same license.

> **Note on `network_mode: host`:** The `docker-compose.yml` uses `network_mode: host` instead of the more common `ports:` mapping, so that browsers on Windows can access the docker running inside WSL. This makes the container share the host's network stack directly without Docker's NAT/bridge layer. This is okay because:
> - Sheet-folio is a LAN-only app with no reverse proxy or HTTPS requirement
> - No inter-container communication is needed (no database or other companion containers)
> - No other Docker container on the same machine is using the same 8888 port
>
> If you later add containers that need to talk to each other (e.g., a database), switch to bridge networking with explicit `ports:` mapping.

### Option 2: Build & Run (requires Node.js/pnpm)

```bash
pnpm install
pnpm build
pnpm start

# To rebuild after code changes: 
pnpm build && pnpm start
```

Open `http://localhost:3000` in your browser. This runs a production server on `0.0.0.0` (all network interfaces). Data persists in `./data/sheet-folio.db`.

> **Note:** `pnpm start` is used instead of `pnpm dev` so the app is accessible from other devices on the same LAN (see LAN Manual Test section at the end).

> **Note:** Docker needs `output: "standalone"` while `pnpm start` needs to run without it. The `next.config.ts` only enables standalone when `NEXT_OUTPUT_STANDALONE=true` (set in the Dockerfile's builder stage), so no manual toggling is needed between LAN testing and Docker builds.

## Data Export

Output goes to `export-data/` (see [SCHEMA.md](SCHEMA.md) for the format):
- `pieces.json` — all pieces with tags, images, and links
- `tags.json` — all tags
- `images/{id}/{kind}/` — re-encoded images with EXIF metadata stripped
- `manifest.json` — export metadata

### Option 1: Via Docker

```bash
./scripts/export-data.sh
```

Streams the SQLite database directly from the running container (bypassing NAS filesystem quirks and WAL checkpoint issues), builds the export image, and outputs to `export-data/`. Requires the sheet-folio container to be running.

### Option 2: Via pnpm (requires Node.js)

```bash
pnpm export-data
```


## Backup

Creates compressed, SHA-deduplicated backups of app volumes and export data, with optional Cloudflare R2 upload. **Keeps the last 5 backups** locally and on R2 — older archives are pruned automatically.

```bash
# Local backup (saves to ~/backups/sheet-folio/{volumes,exports}/)
./backup.sh
./backup.sh --export-dir <path>  # custom export source (default: export-data/)

# Also upload export to R2
./backup.sh --r2-bucket <bucket-name>
```

**Setup for R2:**

1. Get R2 credentials from [Cloudflare Dashboard](https://dash.cloudflare.com/) → R2 → Manage R2 API Tokens → Create API Token (Object Read & Write)
2. Export credentials and endpoint:
   ```bash
   export AWS_ACCESS_KEY_ID="your-access-key-id"
   export AWS_SECRET_ACCESS_KEY="your-secret-key"
   export AWS_ENDPOINT_URL_S3="https://<account-id>.r2.cloudflarestorage.com"
   ```

**What it does:**
- Archives `volumes/app/` and `export-data/` into `~/backups/sheet-folio/{volumes,exports}/`
- Names archives as `<prefix>-<timestamp>-<sha12>.tar.gz` — identical data reuses the same file (SHA dedup)
- Prunes local and R2 storage to the 5 most recent archives
- With `--r2-bucket`, uploads the export archive to Cloudflare R2

## Reference

<details>
<summary>Environment Variables, Database Migrations, Health Check</summary>

### Environment Variables

| Variable      | Default                        | Description                  |
|---------------|--------------------------------|------------------------------|
| `DB_PATH`     | `./data/sheet-folio.db`        | SQLite database file path    |
| `UPLOAD_DIR`  | `./data/uploads`               | Sheet music image upload dir |
| `PORT`        | `3000`                         | Internal server port         |
| `HOSTNAME`    | `0.0.0.0`                     | Bind to all network interfaces |

> **Note:** Docker Compose overrides `PORT` to `8888` — the app is accessible at `http://localhost:8888` when run via Docker.

### Database Migrations

Migrations run automatically on container startup. To generate new migrations during development:

```bash
pnpm db:generate
```

To manually apply migrations:

```bash
pnpm db:migrate
```

### Health Check

The app exposes `/api/health` for container health checks. Docker Compose and orchestrators will monitor this endpoint.

</details>

## LAN Manual Test (develop on PC, test on iPad)

<details>
<summary>Click to expand</summary>

Build and start the production server for LAN access:

```bash
pnpm build && pnpm start
```

The start command listens on `0.0.0.0` by default (`--hostname 0.0.0.0` in `package.json`), so it can be accessed from other devices on the same LAN.

If running inside **WSL2**, the WSL2 virtual network is not directly reachable from the LAN. Run the following setup:

### 1. Enable mirrored networking mode

Create/edit `%USERPROFILE%\.wslconfig` on Windows:

```ini
[wsl2]
networkingMode=mirrored
```

Then restart WSL2: `wsl --shutdown` and reopen your WSL2 terminal.

### 2. If you encounter issue where buttons are not clickable on iPad

Run the following in **PowerShell as Administrator** could help, but you shouldn't need this if you've done the previous step right. The proxy also occupies port 3000 on Windows, interfering with docker run.

```powershell
$wslIP = (wsl hostname -I).Trim().Split()[0]
netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=$wslIP
New-NetFirewallRule -DisplayName "WSL Next.js 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

### 3. Access from LAN

Run `pnpm build && pnpm start` and access the app at `http://<Windows-host-IP>:3000`.

> **Note:** WSL2's internal IP may change after restart, run `hostname -I`.

> **Reminder:** `crypto.randomUUID()` requires a secure context (HTTPS). The fix was to replace it with a `Math.random`-based fallback in `generateId()` — keep this in mind if touching device ID logic.

</details>

