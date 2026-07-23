# Implementation Plan: Gmail + Google Docs MCP Server

> Derived from [problemStatement.md](./problemStatement.md) v1.1  
> **Goal:** Ship a generic MCP server with three required tools (`send_email`, `draft_email`, `append_to_google_doc`), stdio transport, OAuth-based Google auth, and structured errors/outputs.  
> **Status:** Phases 0–5 implemented. Remaining work is live acceptance sign-off (`ACCEPTANCE.md`) and optional remote deploy (v1.1).

---

## 0. Decisions Locked for v1

| Decision | Choice | Rationale |
|---|---|---|
| Language | **TypeScript (Node.js)** | Matches suggested project structure; strong MCP SDK (`@modelcontextprotocol/sdk`); `googleapis` is mature |
| Transport (v1) | **stdio only** | Enough for local Cursor/Claude Desktop; Streamable HTTP deferred to v1.1 |
| Auth model | **Single-user OAuth refresh token** | Matches non-goals; env-based credentials + `tokens.json` |
| Optional tools | **Defer `send_draft` and `idempotency_key`** | Nice-to-haves; not in acceptance criteria |
| Rate limiting | **Map upstream errors + light retry on 429** | Server returns `RATE_LIMITED`; no custom quota UI |
| Doc append output | Return `document_id` + `inserted_at_index` (computed); `revision_id` if available via docs API / omit with note if not | Align with Google Docs `batchUpdate` realities |
| **Deploy (v1)** | **Local stdio via Cursor / Claude Desktop** | Current transport is stdio; agents spawn the process |
| **Deploy (remote / v1.1)** | **Railway** | Chosen host: simple Node/Docker deploys, env-based secrets, public HTTPS URL once Streamable HTTP lands |

---

## 1. Architecture Overview

```
MCP Client (Cursor / Claude / custom SDK)
        │  stdio (JSON-RPC)
        ▼
┌───────────────────────────────────────┐
│  server.ts                            │
│  - register tools + schemas           │
│  - route CallTool → handlers          │
└───────────────┬───────────────────────┘
                │
     ┌──────────┼──────────┐
     ▼          ▼          ▼
 sendEmail  draftEmail  appendToGoogleDoc
     │          │          │
     ▼          ▼          ▼
 gmailClient.ts        docsClient.ts
     │                     │
     └──────────┬──────────┘
                ▼
         googleAuth.ts  ← env credentials + tokens.json + auto refresh
                │
                ▼
         Google Gmail API / Docs API
```

**Design rules (from problem statement §6):**
- Tool handlers take plain JSON inputs only — no agent state.
- Success → `structuredContent` + `text` summary; declare `outputSchema`.
- Failure → `CallToolResult` with `isError: true` + structured error object (never raw stack traces / JSON-RPC tool errors for business failures).
- Auth is a swappable module; tools never touch client ID/secret directly.

---

## 2. Phased Delivery

### Phase 0 — Project scaffold ✅

**Deliverables**
- Initialize `mcp-gmail-docs-server` with TypeScript, ESM, `tsx`/`tsc`, Vitest.
- Dependencies: `@modelcontextprotocol/sdk`, `googleapis`, `zod`, `dotenv`.
- Folder layout, `.env.example`, `.gitignore`.
- Server builds and runs on stdio.

**Exit criteria:** `npm run build` + `npm start` succeed; no secrets committed.

---

### Phase 1 — Auth + shared infrastructure ✅

- Error helpers (`src/types/errors.ts`)
- Config (`src/config.ts`) including `GOOGLE_TOKEN_STORAGE_PATH`
- OAuth module + `scripts/getRefreshToken.ts`
- Structured JSON logging on stderr

**Exit criteria:** Refresh token / `tokens.json` obtainable; auth refreshes.

---

### Phase 2 — Gmail tools ✅

- MIME builder, `send_email`, `draft_email`, unit tests

**Exit criteria:** Unit tests green; live smoke behind `RUN_INTEGRATION=1`.

---

### Phase 3 — Google Docs tool ✅

- Docs client, markdown subset converter, `append_to_google_doc`, unit tests

**Exit criteria:** Plain + markdown append without destroying existing content.

---

### Phase 4 — MCP server wiring & generic client proof ✅

- `server.ts` registers three tools on stdio
- `scripts/smokeClient.ts` for discovery (+ optional live calls)

**Exit criteria:** `tools/list` returns three tools.

---

### Phase 5 — Docs, polish, acceptance ✅ (implementation) / ☐ (live sign-off)

**5.1 README (full)** — root `README.md`  
**5.2 Hardening**
- [x] Secrets gitignored (`.env`, `tokens.json`, `client_secret*.json`)
- [x] Structured errors via `toolError`
- [x] `.env.example` complete
- [x] CI runs build + unit only (no live Google)
- [x] Attachment / validation covered in unit tests

**5.3 Acceptance walkthrough** — [`ACCEPTANCE.md`](./ACCEPTANCE.md)

**Exit criteria:** Problem-statement §9 checklist signed off manually.

---

## 3. Work Breakdown (implementation order)

| # | Task | Depends on | Est. | Status |
|---|---|---|---|---|
| T1 | Scaffold TS project + deps + layout | — | 0.5d | ✅ |
| T2 | Errors, logging, config | T1 | 0.5d | ✅ |
| T3 | `googleAuth` + refresh token script | T2 | 0.5d | ✅ |
| T4 | `gmailClient` MIME + send/draft API wrappers | T3 | 1d | ✅ |
| T5 | MCP tools `send_email` / `draft_email` + unit tests | T4 | 0.5d | ✅ |
| T6 | `docsClient` + markdown converter | T3 | 1d | ✅ |
| T7 | MCP tool `append_to_google_doc` + unit tests | T6 | 0.5d | ✅ |
| T8 | `server.ts` registration + stdio | T5, T7 | 0.5d | ✅ |
| T9 | Generic MCP client smoke + integration flag | T8 | 0.5d | ✅ |
| T10 | README + acceptance pass | T9 | 0.5d | ✅ docs / ☐ live |

**Total:** ~5–6 engineer-days for v1 (single developer).

---

## 4. Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit | MIME, markdown→Docs requests, error mapping, schema validation | Vitest + mocked `googleapis` |
| Integration | Real send/draft/append | `RUN_INTEGRATION=1` + test account/doc ids in env |
| Contract | MCP discovery + call shape | Client SDK smoke script |
| CI | Unit + build only | GitHub Actions — no live Google calls |

**Required env for integration (not in CI):**
```
GOOGLE_* credentials
TEST_EMAIL_TO
TEST_DOCUMENT_ID
RUN_INTEGRATION=1
```

---

## 5. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| OAuth consent / unverified app limits | Blocks send for non-test users | Use test users on consent screen; document “Testing” publishing status |
| Markdown → Docs fidelity gaps | Acceptance “bold/headings/bullets” fails | Limit supported subset; unit tests on request JSON |
| `revision_id` not obvious from `batchUpdate` | Spec mismatch | Return if obtainable; otherwise optional |
| Accidental duplicate sends on agent retry | User spam | Document risk; backlog `idempotency_key` |
| Attachment size / MIME bugs | `UPSTREAM_ERROR` | Size cap + unit fixtures for multipart |
| Logging PII | Security | Metadata-only info logs; reviewed in Phase 5 |

---

## 6. Explicitly Out of Scope (do not implement in v1)

- Email read/search/labels  
- Create new Google Docs  
- Multi-tenant / per-user OAuth UI  
- Outlook / Slack / other providers  
- Streamable HTTP transport (track as v1.1)  
- `send_draft`, `idempotency_key` (backlog)  
- Insert-at-index / placeholder replace (v2)

---

## 7. Backlog (post-v1)

1. Optional tool `send_draft(draft_id)`  
2. Optional `idempotency_key` on `send_email`  
3. Streamable HTTP transport for remote hosting  
4. Deploy to **Railway** (see §10)  
5. Create Google Doc tool  
6. Append at location / replace `{{placeholder}}`  
7. Multi-user OAuth  
8. Server-side rate-limit token bucket (if agents don’t back off)

---

## 8. Definition of Done (v1)

The server is done when:

1. Three tools are discoverable over stdio MCP.  
2. Real Gmail send (text + HTML) and draft creation work.  
3. Real Doc append works for plain and basic markdown.  
4. Errors are structured (`isError` + §6 payload), never raw stacks to the client.  
5. Secrets are env-only; README enables a new engineer to set up Google Cloud + run in under 30 minutes.  
6. A minimal MCP client script can call all three tools using only published schemas.

---

## 9. Suggested First Cursor Prompt (historical)

> Implement Phase 0 and Phase 1 from `IMPLEMENTATION_PLAN.md`: scaffold the TypeScript MCP server per `problemStatement.md` §8, add error helpers, Google OAuth auth module, `.env.example`, and `scripts/getRefreshToken.ts`. Do not implement the three tools yet.

---

## 10. Deployment recommendation

### Target platform: **Railway** (locked)

Remote hosting for this MCP server will be on **[Railway](https://railway.app/)**.

### Why not “just host it” on day one?

v1 uses **stdio** transport: Cursor/Claude spawn `node dist/server.js` as a child process and speak MCP on stdin/stdout. That model does **not** map to Railway’s HTTP service model. The correct v1 “deploy” remains **install locally** and register the server in the client’s MCP config (see `README.md`).

Railway becomes the primary host in **v1.1** after Streamable HTTP is added.

### Recommended platforms

| Phase | Platform | Role |
|---|---|---|
| **v1 (now)** | **Local machine + Cursor / Claude Desktop** | Primary deployment: stdio MCP process |
| **v1.1 (remote)** | **Railway** | Chosen cloud host after Streamable HTTP |
| Alternatives (if Railway blocked) | Render, Fly.io, Google Cloud Run | Same prerequisites: Streamable HTTP + secrets |

### Why Railway (chosen remote platform)

1. **Fast Node/TypeScript deploys** — connect the GitHub repo; Railway builds with Nixpacks or a Dockerfile.  
2. **Env vars / secrets UI** — set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` (or mount token JSON) without baking secrets into the image.  
3. **Public HTTPS URL** — agents and remote MCP clients can reach the service over Streamable HTTP.  
4. **Simple ops** — logs, restarts, and rollbacks without managing GCP IAM for the runtime (Google Cloud stays for Gmail/Docs APIs only).  
5. **Fits the team decision** — deployment target is locked to Railway for this project.

### What Railway needs (v1.1 prerequisites)

Before deploying remotely:

1. Implement **Streamable HTTP** MCP transport (stdio alone is not enough on Railway).  
2. Listen on Railway’s **`$PORT`** (do not hardcode `3000` in production).  
3. Set Railway service variables:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REFRESH_TOKEN` (preferred on Railway; ephemeral filesystem makes `tokens.json` unreliable unless using a volume)
   - `LOG_LEVEL` (optional)
4. `start` command: `npm run build && npm start` (or a Dockerfile `CMD` that runs `node dist/server.js` after HTTP transport exists).  
5. Restrict access (shared secret header / private networking / allowlist) — do not leave a Gmail-capable endpoint open to the public internet unprotected.  
6. Keep the Google OAuth app in Testing or complete verification if used beyond test users.

### Suggested Railway layout (v1.1)

```
Railway project
 └── Service: mcp-gmail-docs-server
      ├── Build: Dockerfile or Nixpacks (Node 20)
      ├── Start: node dist/server.js   # HTTP/MCP entry once implemented
      ├── Variables: GOOGLE_* secrets
      └── Domain: *.up.railway.app (or custom)
```

### Explicit non-recommendations (for this project)

| Platform | Why not primary |
|---|---|
| Vercel / Netlify (serverless functions) | Poor fit for long-lived MCP sessions; cold starts fight agent tool calls |
| Raw VM only | More ops than needed; Railway is simpler for this service |
| MCP registry only (e.g. Smithery) | Great for **distribution** of a local stdio server; not a substitute for remote hosting |

**Summary:** Ship v1 as a **local Cursor MCP server**. Remote deployment target is **Railway** (after Streamable HTTP in v1.1).

**Step-by-step runbook:** [`DEPLOYMENT_PLAN.md`](./DEPLOYMENT_PLAN.md).
