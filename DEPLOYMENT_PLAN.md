# Deployment Plan: mcp-gmail-docs-server

> **Platform:** Railway (remote) · Cursor / Claude Desktop (local stdio)  
> Related: [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) §10 · [`README.md`](./README.md)

This document is a **step-by-step** guide. Follow **Part A** to run today. Follow **Part B** when you are ready to host on Railway (requires Streamable HTTP).

---

## Overview

| Track | Where | Transport | Status |
|---|---|---|---|
| **A — Local** | Your machine + Cursor/Claude | stdio | Ready now |
| **B — Railway** | railway.app | Streamable HTTP | After v1.1 HTTP work |

```
Part A (now)                         Part B (Railway)
────────────                         ────────────────
npm build → Cursor mcp.json          Add HTTP transport → GitHub → Railway
     │                                      │
     ▼                                      ▼
Agent spawns node dist/server.js     HTTPS URL + env secrets → remote MCP clients
```

---

## Part A — Local deployment (stdio) — do this first

### Step 1 — Confirm Google APIs & OAuth

1. In [Google Cloud Console](https://console.cloud.google.com/), open your project.
2. Confirm **Gmail API** and **Google Docs API** are enabled.
3. Confirm you have a **Desktop** OAuth client (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`).
4. Confirm consent screen has your Google account as a **test user** (while app is in Testing).

### Step 2 — Install dependencies

```bash
cd "path/to/M3- MCP Server"
npm install
```

### Step 3 — Configure environment

```bash
cp .env.example .env
```

Fill at least:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_TOKEN_STORAGE_PATH=./tokens.json
GOOGLE_REDIRECT_URI=http://localhost:3000/
LOG_LEVEL=info
```

### Step 4 — Generate tokens (one-time)

```bash
npm run get-refresh-token
```

1. Open the printed URL in a browser.
2. Sign in and allow the requested scopes.
3. Confirm `tokens.json` was created in the project root (gitignored).

Optional: copy the printed refresh token into `.env` as `GOOGLE_REFRESH_TOKEN=...` (useful later for Railway).

### Step 5 — Build & smoke-test locally

```bash
npm run build
npm test
npm run smoke
```

Expected: smoke prints the three tools (`send_email`, `draft_email`, `append_to_google_doc`).

Optional live check:

```bash
# PowerShell
$env:RUN_INTEGRATION="1"
$env:TEST_EMAIL_TO="you@example.com"
$env:TEST_DOCUMENT_ID="your-google-doc-id"
npm run smoke
```

### Step 6 — Register in Cursor

1. Build once: `npm run build`
2. Open Cursor MCP settings / `mcp.json` and add:

```json
{
  "mcpServers": {
    "gmail-docs": {
      "command": "node",
      "args": ["C:/FULL/PATH/TO/M3- MCP Server/dist/server.js"],
      "env": {
        "GOOGLE_CLIENT_ID": "your-client-id",
        "GOOGLE_CLIENT_SECRET": "your-client-secret",
        "GOOGLE_TOKEN_STORAGE_PATH": "C:/FULL/PATH/TO/M3- MCP Server/tokens.json"
      }
    }
  }
}
```

3. Restart Cursor (or reload MCP servers).
4. In chat, confirm tools are listed / callable.

### Step 7 — Local go-live checklist

- [ ] `npm run build` succeeds  
- [ ] `npm run smoke` lists 3 tools  
- [ ] Cursor shows the `gmail-docs` server connected  
- [ ] Send a test email and append to a test Doc  
- [ ] No secrets committed (`.env`, `tokens.json`, `client_secret*.json` gitignored)

**Part A is complete.** You can use the server daily from Cursor without Railway.

---

## Part B — Railway deployment (remote)

> **Blocker (resolved in code):** Streamable HTTP is implemented. When `PORT` is set (Railway), the server listens on `0.0.0.0:$PORT` with `GET /health` and `/mcp`. You still must set Google env vars on Railway.

### Step B0 — Prerequisites (code) ✅

Already in this repo:

1. **Streamable HTTP** when `PORT` or `MCP_TRANSPORT=http` is set.
2. Bind to `process.env.PORT` (Railway injects this).
3. Prefer **`GOOGLE_REFRESH_TOKEN`** from env on Railway.
4. Optional **`MCP_AUTH_TOKEN`** (`Authorization: Bearer …`).
5. **`GET /health`** for Railway healthchecks.
6. `railway.toml` with healthcheck path `/health`.

Skip ahead to **B1** / set Railway Variables if the service is already connected to GitHub.
---

### Step B1 — Put the repo on GitHub

1. Create a private GitHub repository (recommended: private — contains no secrets, but still safer).
2. Ensure `.gitignore` includes `.env`, `tokens.json`, `client_secret*.json`.
3. Push `main` (or `master`).

```bash
git init   # if needed
git add .
git commit -m "Prepare mcp-gmail-docs-server for Railway"
git remote add origin https://github.com/YOUR_ORG/YOUR_REPO.git
git push -u origin main
```

### Step B2 — Create a Railway project

1. Sign in at [railway.app](https://railway.app/).
2. **New Project** → **Deploy from GitHub repo**.
3. Select the MCP server repository.
4. Railway creates a service (rename to `mcp-gmail-docs-server` if you want).

### Step B3 — Configure build & start

In the Railway service **Settings**:

| Setting | Value |
|---|---|
| Builder | Dockerfile **or** Nixpacks |
| Root directory | `/` (repo root) |
| Build command (Nixpacks) | `npm ci && npm run build` |
| Start command | `node dist/server.js` |
| Watch paths | leave default (or `src/**`, `package.json`) |

If using Dockerfile, start command comes from `CMD` — no need to duplicate.

### Step B4 — Set environment variables

In Railway → service → **Variables**, add:

| Variable | Required | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Yes | From Google Cloud OAuth client |
| `GOOGLE_CLIENT_SECRET` | Yes | From Google Cloud OAuth client |
| `GOOGLE_REFRESH_TOKEN` | Yes | From `npm run get-refresh-token` output / `.env` |
| `MCP_AUTH_TOKEN` | Yes (once implemented) | Shared secret clients must send |
| `LOG_LEVEL` | No | `info` or `debug` |
| `NODE_ENV` | No | `production` |

**Do not** set `GOOGLE_TOKEN_STORAGE_PATH` to a relative file unless you attach a Railway volume — prefer refresh token in env.

**Do not** paste `tokens.json` into Railway variables as a huge blob unless you intentionally design for it.

### Step B5 — Generate a public domain

1. Railway → service → **Settings** → **Networking** / **Public Networking**.
2. Click **Generate domain** (e.g. `mcp-gmail-docs-server-production.up.railway.app`).
3. Note the base URL: `https://YOUR_SERVICE.up.railway.app`.

### Step B6 — Deploy

1. Trigger a deploy (push to `main` or **Deploy** in the Railway UI).
2. Open **Deployments** → latest → **Logs**.
3. Confirm logs show auth ready / server listening (no fatal `AUTH_FAILED`).
4. Hit healthcheck:

```bash
curl https://YOUR_SERVICE.up.railway.app/health
```

Expected: HTTP 200.

### Step B7 — Connect a remote MCP client

Point the client at the Streamable HTTP endpoint (exact path depends on your B0 implementation; common patterns: `/mcp` or `/`).

Example (illustrative — adjust to your HTTP transport path and auth header):

```json
{
  "mcpServers": {
    "gmail-docs-remote": {
      "url": "https://YOUR_SERVICE.up.railway.app/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_AUTH_TOKEN"
      }
    }
  }
}
```

Then:

1. Reload the MCP client.
2. Confirm `tools/list` returns the three tools.
3. Call `draft_email` or `append_to_google_doc` against a test account/doc.

### Step B8 — Railway go-live checklist

- [ ] Streamable HTTP implemented and tested locally on `$PORT`  
- [ ] Repo on GitHub; secrets not committed  
- [ ] Railway variables set (`GOOGLE_*`, `MCP_AUTH_TOKEN`)  
- [ ] Public domain generated  
- [ ] `/health` returns 200  
- [ ] Deploy logs show no auth failures  
- [ ] Remote client can list and call tools  
- [ ] Unauthorized requests without token are rejected  
- [ ] Test email / doc append succeeded once  

---

## Part C — Operations (after Railway is live)

### Updating the service

1. Merge changes to `main`.
2. Railway auto-deploys (if enabled) or click **Redeploy**.
3. Watch logs for startup errors.
4. Re-run a quick tool call from the MCP client.

### Rotating secrets

1. Generate a new refresh token locally (`npm run get-refresh-token`) if needed.
2. Update Railway variables → **Redeploy**.
3. Revoke old token at [Google Account permissions](https://myaccount.google.com/permissions) if compromised.

### Monitoring

- Railway **Logs**: JSON lines on stderr (`tool_start`, `tool_success`, `tool_error`).
- Watch for `AUTH_FAILED` / `RATE_LIMITED`.
- Do not enable debug logging in production unless investigating an incident (may include sensitive content).

### Rollback

1. Railway → Deployments → select previous successful deploy → **Rollback**.
2. Or revert the Git commit and redeploy.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Railway deploy “crashes” immediately | Still running stdio-only server | Complete Step B0 (HTTP + `$PORT`) |
| `AUTH_FAILED` on boot | Missing/invalid refresh token | Set `GOOGLE_REFRESH_TOKEN`; re-run get-refresh-token |
| Tools work locally, fail on Railway | Env vars not set on service | Copy vars in Railway UI; redeploy |
| `tokens.json` missing on Railway | Ephemeral filesystem | Use `GOOGLE_REFRESH_TOKEN` instead |
| OAuth “access blocked” | User not a test user / app restricted | Add test user on consent screen |
| 429 / `RATE_LIMITED` | Gmail/Docs quota | Back off; check GCP quotas |
| Anyone can call the server | No auth gate | Require `MCP_AUTH_TOKEN` (or equivalent) |

---

## Security reminders

1. Keep the Railway service **private repo** + **auth on the MCP HTTP endpoint**.  
2. Never commit `.env`, `tokens.json`, or `client_secret_*.json`.  
3. Prefer least privilege: scopes are already limited to `gmail.compose` + `documents`.  
4. Until Google verification, only **test users** can authorize the app.  
5. Treat the Railway URL as sensitive — it can send mail as your connected account.

---

## Suggested order of work

| # | Action | Owner | Done when |
|---|---|---|---|
| 1 | Complete **Part A** (local Cursor) | Dev | Tools work in Cursor |
| 2 | Sign off [`ACCEPTANCE.md`](./ACCEPTANCE.md) | Dev | Checklist ticked |
| 3 | Implement Streamable HTTP + `$PORT` + auth gate (**B0**) | Dev | Local HTTP smoke passes |
| 4 | Push to GitHub (**B1**) | Dev | Private repo ready |
| 5 | Railway project + vars + domain (**B2–B5**) | Dev | Service configured |
| 6 | Deploy + verify remote client (**B6–B8**) | Dev | Remote tool call succeeds |
| 7 | Document production URL internally (not in public README if sensitive) | Team | Ops know where it lives |

---

## Quick reference — Railway variables

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
MCP_AUTH_TOKEN=
LOG_LEVEL=info
NODE_ENV=production
```

Railway sets `PORT` automatically — do not hardcode it.
