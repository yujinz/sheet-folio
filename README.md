# Sheet Folio

A sheet music manager with a web UI accessible from both PC and mobile device. The interface is available in Chinese (zh-CN) and English (en-US), but the data model supports arbitrary languages via primary and alternate name fields - designed for easy extension beyond the two currently implemented UI languages.

App features:
- Create, edit, and delete pieces
- Browse, search, filter, and sort a directory of pieces
- Upload, delete, and reorder sheet images
- Scroll and page-flip sheet views
- Color-coded difficulty/technique/pitch/rhythm tags with support for adding custom tag categories (pitch tags get rainbow colors by octave, sorted low→high)
- Per-device zoom persistence and favorite pieces
- Sheet source link and video links
- Responsive UI polished across PC, iPad, and phone (frozen table headers, adaptive layouts, and touch-friendly interactions)
- Automated backup with SHA dedup, pruning, and Cloudflare R2 sync (fully logged)

## Quick Start

### Option 1: Docker Compose

```bash
git clone https://github.com/yujinz/sheet-folio.git
cd sheet-folio
docker compose up -d

# To rebuild after code changes: 
docker compose up -d --build
```

Open `http://localhost:8888` in your browser. Stop with `docker compose down`. Data persists in Docker volumes. 

<details>
<summary><b>Note:</b> WSL2 setup</summary>

If running inside WSL2, add the below to `%USERPROFILE%\.wslconfig`:

```ini
[wsl2]
networkingMode=mirrored
firewall=false
```

Then restart WSL2 with `wsl --shutdown`, reopen your WSL2 terminal, and start docker.

</details>

<details>
<summary><b>Note: <code>network_mode: host</code></b></summary>

The `docker-compose.yml` uses `network_mode: host` instead of the more common `ports:` mapping, so that browsers on Windows can access the docker running inside WSL. This makes the container share the host's network stack directly without Docker's NAT/bridge layer. This is okay because:

- Sheet-folio is a LAN-only app with no reverse proxy or HTTPS requirement
- No inter-container communication is needed (no database or other companion containers)
- No other Docker container on the same machine is using the same 8888 port

If you later add containers that need to talk to each other (e.g., a database), switch to bridge networking with explicit `ports:` mapping.

</details>

### Option 2: pnpm (requires Node.js/pnpm)

```bash
pnpm install
pnpm build
pnpm start

# To rebuild after code changes: 
pnpm build && pnpm start
```

Open `http://localhost:3000` in your browser. This runs a production server on `0.0.0.0` (all network interfaces). Data persists in `./data/sheet-folio.db`.

<details>
<summary><b>Note:</b> <code>pnpm start</code> vs <code>pnpm dev</code></summary>

`pnpm start` is used instead of `pnpm dev` so the app is accessible from other devices on the same LAN (see LAN Manual Test section at the end).

</details>

<details>
<summary><b>Note:</b> Docker standalone output</summary>

Docker needs `output: "standalone"` while `pnpm start` needs to run without it. The `next.config.ts` only enables standalone when `NEXT_OUTPUT_STANDALONE=true` (set in the Dockerfile's builder stage), so no manual toggling is needed between LAN testing and Docker builds.

</details>

## Demo

A browser-only demo of sheet-folio with the full UI. All data is stored in `sessionStorage` and lost when you close the tab — not meant for real use.

<details>
<summary><b>Build & run locally</b></summary>

```bash
pnpm build:demo
npx serve out -p 3456
```

Open `http://localhost:3456` in your browser.
</details>

<details>
<summary><b>Auto-deploy to GitHub Pages</b></summary>

1. In your repo **Settings → Pages → Build and deployment**, set **Source** to **"GitHub Actions"**.
2. Push to `main`. The `.github/workflows/deploy-demo.yml` workflow builds with `NEXT_PUBLIC_DEMO_MODE=true` and deploys.
3. If your repo name differs from `sheet-folio`, update the `NEXT_PUBLIC_BASE_PATH` env in `.github/workflows/deploy-demo.yml` to match.

The demo will be live at `https://<user>.github.io/<repo>/`.
</details>

<details>
<summary><b>How it works</b></summary>

- **`NEXT_PUBLIC_DEMO_MODE=true`** switches the build to `output: "export"` (static HTML/JS, no server).
- **`src/lib/demo-fetch.ts`** intercepts all `fetch("/api/*")` calls and routes them to a `sessionStorage`-based data store.
- **`src/lib/demo-store.ts`** mirrors every DB operation (pieces, tags, images, zoom, etc.) using JSON in `sessionStorage`.
- **`src/lib/demo-seed.ts`** contains the built-in tags, categories, and seed pieces — no SQLite needed.
- **Zero changes** to any UI component. The fetch interceptor is transparent to the app.

To add seed pieces or images, edit `src/lib/demo-seed.ts` and rebuild.

> **Keeping the demo in sync:** When `main` gets new features or API changes, merge into `demo`:
> ```bash
> git checkout demo
> git merge main
> # Resolve any conflicts in demo-only files, then push
> git push
> ```
> If the real API adds a new route, add a handler in `src/lib/demo-fetch.ts` and the corresponding operation in `src/lib/demo-store.ts` — the build will fail with a clear error if something is missing.
</details>

## Data Export

Output goes to `export-data/` (see [SCHEMA.md](SCHEMA.md) for the format):
- `pieces.json` — all pieces with tags, images, and links
- `tags.json` — all tags
- `images/{id}/{kind}/` — re-encoded images with EXIF metadata stripped
- `manifest.json` — export metadata

### Option 1: Docker

```bash
./scripts/export-data.sh
```

Exports the database from the running container, builds the export image, and outputs to `export-data/`. Requires the sheet-folio container to be running.

Logs milestones to `$HOME/logs/sheet-folio-export-data.log`. On failure, the last 20 lines of output are appended to the log automatically.

Quick check:
```bash
tail -n 6 $HOME/logs/sheet-folio-export-data.log
```

### Option 2: pnpm (requires Node.js)

```bash
pnpm export-data
```


## Backup

Creates compressed, SHA-deduplicated backups of app volumes and export data, with optional object storage upload. Archives are named `<prefix>-<timestamp>-<sha12>.tar.gz` - identical data reuses the same file. Keeps the last 5 unique-SHA backups both locally and on R2.

```bash
# Local backup (saves to ~/backups/sheet-folio/{volumes,exports}/)
./backup.sh
./backup.sh --export-dir <path>  # custom export source (default: export-data/)

# Also upload export to Cloudflare R2
./backup.sh --r2-bucket <bucket-name>

# Custom retention
./backup.sh --keep 10            # keep last 10 local archives (default: 5)
./backup.sh --r2-keep 20         # keep last 20 on R2 (default: same as --keep)
```

Logs milestones to `$HOME/logs/sheet-folio-backup.log` — created archives, SHA dedup events, and pruned file names (with creation dates and SHAs) are all recorded. On failure, the last 20 lines of output are appended automatically.

Quick check:
```bash
tail -n 10 $HOME/logs/sheet-folio-backup.log
```

**Setup for Cloudflare R2:**

1. Get R2 credentials from [Cloudflare Dashboard](https://dash.cloudflare.com/) → R2 → Manage R2 API Tokens → Create API Token (Object Read & Write)
2. Add to `.env` in the project root:
   ```bash
   AWS_ACCESS_KEY_ID="your-access-key-id"
   AWS_SECRET_ACCESS_KEY="your-secret-key"
   AWS_ENDPOINT_URL_S3="https://<account-id>.r2.cloudflarestorage.com"
   ```
   The `.env` file is auto-loaded by `backup.sh`.

## LAN Manual Test - Develop on PC and test on mobile devices under the same LAN

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

### 2. If you encounter issue where buttons are not clickable on mobile device

Run the following in **PowerShell as Administrator** could help, but you shouldn't need this if you've done the previous step right. The proxy also occupies port 3000 on Windows, interfering with docker run.

```powershell
$wslIP = (wsl hostname -I).Trim().Split()[0]
netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=$wslIP
New-NetFirewallRule -DisplayName "WSL Next.js 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

### 3. Access from LAN

Run `pnpm build && pnpm start` and access the app at `http://<Windows-host-IP>:3000`.

<details>
<summary><b>Note:</b> WSL2 IP changes</summary>

WSL2's internal IP may change after restart, run `hostname -I`.

</details>

<details>
<summary><b>Reminder:</b> <code>crypto.randomUUID()</code> HTTPS requirement</summary>

`crypto.randomUUID()` requires a secure context (HTTPS). The fix was to replace it with a `Math.random`-based fallback in `generateId()` — keep this in mind if touching device ID logic.

</details>

</details>

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

<details>
<summary><b>Note:</b> Docker Compose PORT</summary>

Docker Compose overrides `PORT` to `8888` — the app is accessible at `http://localhost:8888` when run via Docker.

</details>

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

## License

[AGPLv3](LICENSE) — you may use, modify, and distribute this software freely,
but if you run it as a network service or distribute modified versions, you
must make your changes available under the same license.

