# mcp-gmail-docs-server

Generic **Model Context Protocol (MCP)** server that gives any MCP-compatible client (Cursor, Claude Desktop, custom agents) three tools:

| Tool | Description |
|---|---|
| `send_email` | Send an email via Gmail (text/HTML, CC/BCC, attachments, optional thread) |
| `draft_email` | Create a Gmail draft (same inputs as send) |
| `append_to_google_doc` | Append plain text or basic markdown to an existing Google Doc |

Auth and configuration live in the **server environment**, not in the calling agent.

---

## Prerequisites

- Node.js **18+**
- A Google Cloud project with a **Desktop** OAuth client
- Gmail API + Google Docs API enabled

---

## 1. Google Cloud setup

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create (or select) a project.
2. Enable APIs:
   - [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
   - [Google Docs API](https://console.cloud.google.com/apis/library/docs.googleapis.com)
3. Configure the **OAuth consent screen** (External is fine for personal/testing).
   - Add yourself as a **test user** while the app is in Testing.
   - Scopes used by this server:
     - `https://www.googleapis.com/auth/gmail.compose`
     - `https://www.googleapis.com/auth/documents`
4. Create credentials → **OAuth client ID** → Application type **Desktop app**.
5. Download the client JSON (or copy Client ID / Client Secret into `.env`).

---

## 2. Local install & env

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```env
GOOGLE_CLIENT_ID=...your client id...
GOOGLE_CLIENT_SECRET=...your client secret...
GOOGLE_TOKEN_STORAGE_PATH=./tokens.json
GOOGLE_REDIRECT_URI=http://localhost:3000/
```

`GOOGLE_REFRESH_TOKEN` is optional if tokens are stored in `tokens.json` (recommended).

---

## 3. One-time OAuth (create `tokens.json`)

```bash
npm run get-refresh-token
```

1. Ensure the redirect URI (`http://localhost:3000/`) is allowed for your Desktop OAuth client (loopback is standard for Desktop apps).
2. Open the printed URL, sign in, and grant access.
3. Tokens are written to `GOOGLE_TOKEN_STORAGE_PATH` (default `./tokens.json`).

`tokens.json` is gitignored — never commit it.

---

## 4. Run the server

```bash
npm run build
npm start
# or during development:
npm run dev
```

The server speaks MCP over **stdio** (stdout is the protocol; logs go to stderr).

### Verify discovery (no live Google calls)

```bash
npm run smoke
```

### Live integration smoke (optional)

```bash
# PowerShell
$env:RUN_INTEGRATION="1"
$env:TEST_EMAIL_TO="you@example.com"
$env:TEST_DOCUMENT_ID="your-doc-id-from-url"
npm run smoke
```

---

## 5. Cursor / Claude Desktop config

### Cursor (`mcp.json`)

Add something like:

```json
{
  "mcpServers": {
    "gmail-docs": {
      "command": "node",
      "args": ["C:/Users/YOU/path/to/M3- MCP Server/dist/server.js"],
      "env": {
        "GOOGLE_CLIENT_ID": "your-client-id",
        "GOOGLE_CLIENT_SECRET": "your-client-secret",
        "GOOGLE_TOKEN_STORAGE_PATH": "C:/Users/YOU/path/to/M3- MCP Server/tokens.json"
      }
    }
  }
}
```

Or point `command` at `npx` + `tsx` and `args` at `src/server.ts` for a no-build workflow.

### Claude Desktop

Same shape under `mcpServers` in Claude’s config file (stdio `command` / `args` / `env`).

---

## 6. Tool reference

### `send_email`

| Field | Type | Required | Notes |
|---|---|---|---|
| `to` | string \| string[] | Yes | Recipients |
| `subject` | string | Yes | |
| `body` | string | Yes | |
| `body_type` | `"text"` \| `"html"` | No | Default `"text"` |
| `cc` / `bcc` | string \| string[] | No | |
| `attachments` | `{ filename, content_base64, mime_type }[]` | No | Max ~20MB total |
| `thread_id` | string | No | Reply in thread |

**Success:** `{ status: "sent", message_id, thread_id }`

### `draft_email`

Same inputs as `send_email`.

**Success:** `{ status: "draft_created", draft_id, message_id }`

### `append_to_google_doc`

| Field | Type | Required | Notes |
|---|---|---|---|
| `document_id` | string | Yes | From the Doc URL |
| `content` | string | Yes | |
| `format` | `"plain"` \| `"markdown"` | No | Default `"plain"` |
| `add_page_break_before` | boolean | No | Default `false` |
| `newline_before` | boolean | No | Default `true` |

Markdown subset: `#`–`###` headings, `**bold**`, `-` / `*` bullets (best-effort for other markup).

**Success:** `{ status: "appended", document_id, inserted_at_index, revision_id? }`

### Errors

All tool failures return MCP `isError: true` with:

```json
{
  "status": "error",
  "error_code": "AUTH_FAILED | INVALID_INPUT | NOT_FOUND | RATE_LIMITED | UPSTREAM_ERROR",
  "message": "human readable description",
  "details": {}
}
```

---

## 7. Security notes

- Never commit `.env`, `tokens.json`, or `client_secret_*.json`.
- Info logs include metadata only (recipient counts, subject length, doc id) — not email/doc bodies.
- Scopes are intentionally narrow (`gmail.compose` + `documents`).
- Prefer `tokens.json` on disk over putting the refresh token in chat logs or screenshots.
- Keep the OAuth app in **Testing** and restrict test users until you complete Google verification (if you go beyond personal use).

---

## 8. Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Run server via `tsx` (stdio) |
| `npm run build` / `npm start` | Compile and run |
| `npm test` | Unit tests (no live Google calls) |
| `npm run get-refresh-token` | One-time OAuth → `tokens.json` |
| `npm run smoke` | MCP client: `tools/list` (+ live tools if `RUN_INTEGRATION=1`) |

---

## 9. Deployment

**v1 (current):** run **locally** via Cursor / Claude Desktop (stdio). That is the primary deployment model.

**Remote platform (locked):** **[Railway](https://railway.app/)** — deploy after Streamable HTTP lands in v1.1. Set `GOOGLE_*` secrets as Railway variables; prefer `GOOGLE_REFRESH_TOKEN` over `tokens.json` on Railway’s ephemeral filesystem.

**Step-by-step:** see [`DEPLOYMENT_PLAN.md`](./DEPLOYMENT_PLAN.md) (Part A local · Part B Railway).

---

## Project docs

- [`problemStatement.md`](./problemStatement.md) — requirements
- [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) — phases, backlog, deployment rationale
- [`DEPLOYMENT_PLAN.md`](./DEPLOYMENT_PLAN.md) — step-by-step local + Railway deploy
- [`ACCEPTANCE.md`](./ACCEPTANCE.md) — live acceptance checklist
