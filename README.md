# Sheet Folio

A recorder sheet music manager and browser.

## Development

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000` in your browser.

## LAN Test

Build and start the production server for LAN access:

```bash
pnpm build
pnpm start
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

## Server Deployment

TODO

To deploy with Docker, add `output: "standalone"` back to `next.config.ts`.