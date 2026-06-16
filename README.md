# Sheet Folio

A sheet music manager with a web UI accessible from both PC and iPad.

App features: browse, search, and sort a directory of pieces; upload, delete, and drag-to-reorder sheet images; color-coded difficulty/technique/pitch/rhythm tags; scroll and page-flip sheet views; per-device zoom persistence; sheet source and video link management; full CRUD.

<details>
<summary><h2 style="display:inline">Quick Start: Local Management + Static Export</summary>

If you don't want to deal with server deployment or LAN setup, you can run the app locally to manage your sheet music collection, then export a self-contained data bundle. You can convert the data into a static site by yourself for easy hosting.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000` in your browser. Add, edit, and organize your pieces using the full web UI. The SQLite database (`./data/sheet-folio.db`) persists on disk even after you close the app, so you can always resume where you left off.

When you're ready to share, export the data:

```bash
pnpm export-data
```

The export produces a structured data bundle in `export-data/` (see [SCHEMA.md](SCHEMA.md) for the format). Feed this into a static site generator or any other downstream tool to produce a self-contained static site — no server or database required for the hosted site.

</details>

<details>
<summary><h2 style="display:inline">Development</h2></summary>

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000` in your browser.

</details>

<details>
<summary><h2 style="display:inline">Unit Test</h2></summary>

```bash
pnpm test
```

Runs the test suite with vitest. Tests cover utility functions (API helpers, i18n messages, upload sanitization, data grouping) and database integration (CRUD operations, tag assignment, image ordering, device zoom).

</details>

<details>
<summary><h2 style="display:inline">LAN Manual Test: Develop on PC and test on iPad</h2></summary>

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

<details>
<summary><h2 style="display:inline">Server Deployment with Docker</h2></summary>

### Prerequisites

- Docker and Docker Compose

### Quick Start

1. Clone the repository on your server.

2. Create directories for persistent data and SSL certs:

```bash
mkdir -p volumes/data/sheet-folio
```
3. Disable firewall

Create/edit `%USERPROFILE%\.wslconfig` on Windows:

```ini
[wsl2]
networkingMode=mirrored
firewall=false
```

4. Build and start:

```bash
docker compose up -d
```

The app will be available at `http://localhost:3100` (plain HTTP, no SSL setup needed).

> **Note on `network_mode: host`:** The `docker-compose.yml` uses `network_mode: host` instead of the more common `ports:` mapping, so that browsers in Windows can access the port. This makes the container share the host's network stack directly — the app listens on `localhost:8888` (or whichever `PORT` is set) without Docker's NAT/bridge layer. This is okay because:
> - Sheet-folio is a LAN-only app with no reverse proxy or HTTPS requirement
> - No inter-container communication is needed (no database or other companion containers)
> - Host networking avoids port conflicts with other Docker services on the same machine
>
> If you later add containers that need to talk to each other (e.g., a database), switch to bridge networking with explicit `ports:` mapping.

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

TBD

### Architecture

- **Next.js** app running as a standalone Node server
- **better-sqlite3** for local database (data stored in a Docker volume)
- **nginx** as a reverse proxy for HTTPS termination
- **Docker Compose** orchestrates both services

</details>

<details>
<summary><h2 style="display:inline">Data Export</h2></summary>

This repo produces a structured data export that can be consumed by downstream tools (static site generators, backup systems, migration pipelines). The export format is documented in [SCHEMA.md](SCHEMA.md).

### Export Data

Extract structured data from the SQLite database and images:

```bash
pnpm export-data
```

Output goes to `export-data/`:

- `pieces.json` — all pieces with tags, images, and links
- `tags.json` — all tags
- `images/{id}/{kind}/` — re-encoded images with EXIF metadata stripped
- `manifest.json` — export metadata

#### Via Docker (no Node.js required)

```bash
docker build -f Dockerfile.export -t sheet-folio-export .
docker run --rm \
  -e DB_PATH=/data/sheet-folio.db \
  -e UPLOAD_DIR=/data/uploads \
  -e OUTPUT_DIR=/data/output \
  -v /path/to/data/sheet-folio.db:/data/sheet-folio.db:ro \
  -v /path/to/data/uploads:/data/uploads:ro \
  -v /path/to/export-data:/data/output \
  sheet-folio-export
```

### Consuming the Export

Downstream tools read the data export and content files, then produce a self-contained static HTML site. The downstream repo owns its own `Dockerfile` and `deploy.sh` for building and pushing the site — no npm required on the server.

Output includes:

- `index.html` — directory page with search, tag filtering, and sorting
- `piece/{id}/index.html` — detail pages with image galleries and links
- `images/{id}/{kind}/` — re-encoded images

### Data Format

The exchange format is documented in [SCHEMA.md](SCHEMA.md).

### Automated Deployment (cron)

To export data daily on a server:

```
0 3 * * * cd /path/to/sheet-folio && docker run --rm -e DB_PATH=/data/sheet-folio.db -e UPLOAD_DIR=/data/uploads -e OUTPUT_DIR=/data/output -v $PWD/volumes/app/sheet-folio.db:/data/sheet-folio.db:ro -v $PWD/volumes/app/uploads:/data/uploads:ro -v $PWD/export-data:/data/output sheet-folio-export
```

Downstream tools consume the export independently — see their own documentation for cron setup.

