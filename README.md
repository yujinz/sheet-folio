# Sheet Folio

A recorder sheet music manager with a web UI accessible from both PC and iPad on the same LAN.

Features: browse, search, and sort a directory of pieces; color-coded difficulty/technique/pitch/rhythm tags; scroll and page-flip sheet views; upload, delete, and drag-to-reorder sheet images; per-device zoom persistence; video link management; full CRUD.

## Development

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000` in your browser.

## Testing

```bash
pnpm test
```

Runs the test suite with vitest. Tests cover utility functions (API helpers, i18n messages, upload sanitization, data grouping) and database integration (CRUD operations, tag assignment, image ordering, device zoom).

## LAN Manual Test - Develope on PC and access the app from iPad

Build and start the production server for LAN access:

```bash
pnpm build
pnpm start
```

The start command listens on `0.0.0.0` by default (`--hostname 0.0.0.0` in `package.json`), so it can be accessed from other devices on the same LAN.

> **Note:** Docker deployment requires Next.js's `output: "standalone"` mode. The `next.config.ts` enables it automatically when `NEXT_OUTPUT_STANDALONE=true` (set in the Dockerfile's builder stage), so no manual toggling is needed between LAN testing and Docker builds.

If running inside **WSL2**, the WSL2 virtual network is not directly reachable from the LAN. Run the following setup:

### 1. Enable mirrored networking mode

Create/edit `%USERPROFILE%\.wslconfig` on Windows:

```ini
[wsl2]
networkingMode=mirrored
```

Then restart WSL2: `wsl --shutdown` and reopen your WSL2 terminal.

### 2. Add port forwarding and firewall rule

Run the following in **PowerShell as Administrator**:

```powershell
$wslIP = (wsl hostname -I).Trim().Split()[0]
netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=$wslIP
New-NetFirewallRule -DisplayName "WSL Next.js 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

### 3. Access from LAN

Run `pnpm build && pnpm start` and access the app at `http://<Windows-host-IP>:3000`.

> **Note:** WSL2's internal IP may change after restart, so re-run the portproxy command if needed.

> **Reminder:** `crypto.randomUUID()` requires a secure context (HTTPS). When accessing via plain HTTP (e.g. from iPad on LAN), it throws. The fix was to replace it with a `Math.random`-based fallback in `generateId()` — keep this in mind if touching device ID logic.

## Server Deployment with Docker

### Prerequisites

- Docker and Docker Compose
- SSL certificate files (for HTTPS)

### Quick Start

1. Clone the repository on your server.

2. Create directories for persistent data and SSL certs:

```bash
mkdir -p volumes/data/sheet-folio
```

3. Place your SSL certificate and key at `../certs/volumes/data/sheet-folio/ssl.crt` and `../certs/volumes/data/sheet-folio/ssl.key` (or adjust paths in `docker-compose.yml`).

4. Build and start:

```bash
docker compose up -d
```

The app will be available at `https://your-server:3444`.

### Environment Variables

| Variable      | Default                        | Description                  |
|---------------|--------------------------------|------------------------------|
| `DB_PATH`     | `./data/sheet-folio.db`        | SQLite database file path    |
| `UPLOAD_DIR`  | `./data/uploads`               | Sheet music image upload dir |
| `PORT`        | `3000`                         | Internal server port         |
| `HOSTNAME`    | `0.0.0.0`                     | Server bind address          |

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

### Backup

A `backup.sh` script is provided to back up the SQLite database and uploaded images to the NAS:

```bash
./backup.sh
```

The script stops the `sheet-folio` container, archives `volumes/app/` (SQLite DB + uploads), restarts the container, and copies the archive to `web17@nas17:/srv/mergerfs/Merger1/merger/otlab/` via SCP. Old backups accumulate on the NAS (no automatic rotation). Schedule it with cron:

```
0 3 * * * /path/to/sheet-folio/backup.sh
```

### Architecture

- **Next.js** app running as a standalone Node server
- **better-sqlite3** for local database (data stored in a Docker volume)
- **nginx** as a reverse proxy for HTTPS termination
- **Docker Compose** orchestrates both services