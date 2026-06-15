# Sheet Folio

A sheet music manager with a web UI accessible from both PC and iPad.

App features: browse, search, and sort a directory of pieces; upload, delete, and drag-to-reorder sheet images; color-coded difficulty/technique/pitch/rhythm tags; scroll and page-flip sheet views; per-device zoom persistence; sheet source and video link management; full CRUD.

<details>
<summary><h2 style="display:inline">Quick Start: Local Management + Static Export</h2></summary>

If you don't want to deal with server deployment or LAN setup, you can run the app locally to manage your sheet music collection, then export a self-contained static site for easy hosting.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000` in your browser. Add, edit, and organize your pieces using the full web UI. The SQLite database (`./data/sheet-folio.db`) persists on disk even after you close the app, so you can always resume where you left off.

When you're ready to share, generate a static site:

```bash
pnpm export
```

Copy the contents of `static-export/` to any static host (Codeberg Pages, GitHub Pages, Netlify, etc.) — no server or database required for the hosted site.

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

### 2. If you encounter issue where buttons are not clickable on iPad, the below port forwarding and firewall rule could help, but you shouldn't need this if you've done the previous step right.

Run the following in **PowerShell as Administrator**:

```powershell
$wslIP = (wsl hostname -I).Trim().Split()[0]
netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=$wslIP
New-NetFirewallRule -DisplayName "WSL Next.js 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

### 3. Access from LAN

Run `pnpm build && pnpm start` and access the app at `http://<Windows-host-IP>:3000`.

> **Note:** WSL2's internal IP may change after restart,`wsl hostname -I`.

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

> **Note on `network_mode: host`:** The `docker-compose.yml` uses `network_mode: host` instead of the more common `ports:` mapping, so that browsers in Windows can access the port. This makes the container share the host's network stack directly — the app listens on `localhost:8080` (or whichever `PORT` is set) without Docker's NAT/bridge layer. This is okay because:
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

The script stops the `sheet-folio` container, archives `volumes/app/` (SQLite DB + uploads), restarts the container, and copies the archive to `web17@nas17:/srv/mergerfs/Merger1/merger/otlab/` via SCP. Old backups accumulate on the NAS (no automatic rotation). Schedule it with cron:

```
0 3 * * * /path/to/sheet-folio/backup.sh
```

### Architecture

- **Next.js** app running as a standalone Node server
- **better-sqlite3** for local database (data stored in a Docker volume)
- **nginx** as a reverse proxy for HTTPS termination
- **Docker Compose** orchestrates both services

</details>

<details>
<summary><h2 style="display:inline">Static Export</h2></summary>

Generate a self-contained static HTML site from the database for sharing on free static hosts (Codeberg Pages, GitHub Pages, etc.):

```bash
pnpm export
```

Output goes to `static-export/`. It includes:

- `index.html` — directory page with search, tag filtering, and sorting (client-side, no server needed)
- `piece/{id}/index.html` — detail pages with image galleries and links
- `images/{id}/{kind}/` — re-encoded images with EXIF metadata stripped

### Preview

```bash
cd static-export && python3 -m http.server 8080
```

Open `http://localhost:8080` to browse the exported collection.

### Deployment via pnpm (for development machines)

A deploy script is provided to export the site and push it to a Git branch that your static host uses for Pages:

```bash
pnpm deploy:static
```

This runs `pnpm export` first, then pushes the result to the `pages` branch of your repository by default. On Codeberg Pages or GitHub Pages, configure that branch as your Pages source.

#### Authentication

The script supports two authentication methods. Choose one:

**Option A: SSH key (recommended)**

1. On the server (the machine running cron), generate a key pair:

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/sheet-folio-deploy -N ""
   ```

2. Copy the public key and add it to your Codeberg account:

   ```bash
   cat ~/.ssh/sheet-folio-deploy.pub
   ```

   Go to **Codeberg → Settings → SSH/GPG Keys → Add Key** and paste it.

3. Run the deploy with:

   ```bash
   DEPLOY_KEY=~/.ssh/sheet-folio-deploy pnpm deploy:static
   ```

**Option B: Personal access token**

1. Create a token on Codeberg: **Settings → Applications → Generate Token** with repo write access.
2. Run the deploy with:

   ```bash
   DEPLOY_TOKEN=your_token_here pnpm deploy:static
   ```

With either method, the secret (private key file or token) stays **outside the repo** — the server has it, but it's never committed.

#### Environment Variables

| Variable       | Default                      | Description                                      |
|----------------|------------------------------|--------------------------------------------------|
| `TARGET_REPO`  | (auto-detected from git origin) | Remote URL (e.g. `git@codeberg.org:user/repo`) |
| `TARGET_BRANCH`| `pages`                      | Branch to push to                                |
| `DEPLOY_KEY`   | (uses default SSH agent)     | Path to SSH private key                          |
| `DEPLOY_TOKEN` | (uses default SSH agent)     | Personal access token for HTTPS auth             |

#### Cron (automatic updates)

Schedule the export and deploy to run daily. It only pushes when the exported content has actually changed (no-op if identical):

```cron
0 3 * * * cd /path/to/sheet-folio && DEPLOY_KEY=/home/user/.ssh/sheet-folio-deploy ./scripts/deploy-static.sh >> /tmp/sheet-folio-deploy.log 2>&1
```

Or with a token:

```cron
0 3 * * * cd /path/to/sheet-folio && DEPLOY_TOKEN=abc123 ./scripts/deploy-static.sh >> /tmp/sheet-folio-deploy.log 2>&1
```

This lets you keep managing sheets locally via `pnpm dev` while the public site stays in sync automatically.

### Manual Deployment

Copy the contents of `static-export/` to any static host. For Codeberg Pages or GitHub Pages, also include an empty `.nojekyll` file in the root to prevent Jekyll processing.

### Environment Variables

| Variable     | Default                   | Description                       |
|-------------|---------------------------|-----------------------------------|
| `DB_PATH`   | `./data/sheet-folio.db`   | Path to the SQLite database       |
| `UPLOAD_DIR`| `./data/uploads`          | Sheet music image upload directory|
| `OUTPUT_DIR`| `./static-export`         | Directory for the exported site   |

</details>
