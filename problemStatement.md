# Problem Statement: Gmail + Google Docs MCP Server

> **Version:** 1.1 &nbsp;•&nbsp; **Status:** Ready for implementation &nbsp;•&nbsp; **Scope:** v1

## 1. Overview

We need to build a **Model Context Protocol (MCP) server** that gives AI agents the ability to:

1. **Send / draft emails via Gmail**
2. **Append content to a Google Doc**

The server must be **generic and reusable** — not tied to any single AI agent, framework, or internal system. Any MCP-compatible client (Claude, a custom agent, another LLM orchestrator, etc.) should be able to connect to this server, discover its tools, and use them without special-casing our specific agent.

This document defines scope, requirements, and expected behavior so it can be handed to an engineering tool (e.g., Cursor) to scaffold and implement the server.

---

## 2. Goals

- Expose Gmail and Google Docs actions as clean, well-documented **MCP tools**.
- Keep the server **stateless** with respect to any particular calling agent — auth and config live in the server/environment, not baked into agent-specific logic.
- Make the tool interfaces **generic enough** that any MCP client can call them using standard MCP tool-call semantics (name + JSON input schema).
- Provide clear **error handling** and **structured responses** so calling agents can reason about success/failure without parsing free text.
- Follow MCP server best practices (proper manifest/schema, minimal permissions, no hardcoded secrets).

## 3. Non-Goals (for v1)

- No support for reading/searching emails, managing labels, or full inbox management (only send/draft).
- No support for creating new Google Docs from scratch (only appending to an existing doc) — creation can be a future extension.
- No multi-user / multi-tenant credential management UI. Single-user (or single service account) OAuth setup is sufficient for v1.
- No support for other providers (Outlook, Slack, etc.) — Gmail and Google Docs only.

---

## 4. Functional Requirements

### 4.1 Tool: `send_email`

Sends an email immediately via Gmail.

**Input parameters:**
| Field | Type | Required | Notes |
|---|---|---|---|
| `to` | string or string[] | Yes | One or more recipient email addresses |
| `subject` | string | Yes | Email subject line |
| `body` | string | Yes | Plain text or HTML body |
| `body_type` | enum: `"text"` \| `"html"` | No (default `"text"`) | Determines MIME formatting |
| `cc` | string or string[] | No | CC recipients |
| `bcc` | string or string[] | No | BCC recipients |
| `attachments` | array of `{ filename, content_base64, mime_type }` | No | Optional file attachments |
| `thread_id` | string | No | If replying within an existing Gmail thread |

**Output:**
```json
{
  "status": "sent",
  "message_id": "string",
  "thread_id": "string"
}
```

**Errors:** invalid recipient, auth failure, Gmail API quota/rate limit, attachment too large — each returned as a structured error object (see §6).

---

### 4.2 Tool: `draft_email`

Creates a Gmail draft without sending it. Uses the **same input schema as `send_email`**, including the optional `thread_id` (a draft may be associated with an existing thread). The only difference is behavioral: the message is saved to Drafts rather than sent.

**Output:**
```json
{
  "status": "draft_created",
  "draft_id": "string",
  "message_id": "string"
}
```

Optionally support a companion tool `send_draft(draft_id)` to send a previously created draft — nice-to-have, not required for v1 but worth flagging as an easy extension.

---

### 4.3 Tool: `append_to_google_doc`

Appends content to the end of an existing Google Doc.

**Input parameters:**
| Field | Type | Required | Notes |
|---|---|---|---|
| `document_id` | string | Yes | Google Doc ID (from the doc's URL) |
| `content` | string | Yes | Text to append |
| `format` | enum: `"plain"` \| `"markdown"` | No (default `"plain"`) | If `"markdown"`, server should do basic conversion (headings, bold, bullet lists) to Google Docs formatting requests |
| `add_page_break_before` | boolean | No (default `false`) | Insert a page break before the appended content |
| `newline_before` | boolean | No (default `true`) | Insert a newline before appending, to avoid running into existing text |

**Output:**
```json
{
  "status": "appended",
  "document_id": "string",
  "revision_id": "string",
  "inserted_at_index": "number"
}
```

**Errors:** doc not found, insufficient permissions, invalid document_id, malformed markdown.

---

## 5. Authentication & Authorization

- Use **OAuth 2.0** (Google Cloud project with Gmail API + Google Docs API enabled).
- Support standard Google OAuth scopes, minimally:
  - `https://www.googleapis.com/auth/gmail.compose` — create/update drafts **and** send messages (this scope already covers `send_email`, `draft_email`, and the optional `send_draft`).
  - `https://www.googleapis.com/auth/documents` — read/write Google Docs content.
  - > Note: `https://www.googleapis.com/auth/gmail.send` (send-only) is sufficient on its own **only** if drafts are not needed. Since v1 includes `draft_email`, request `gmail.compose`. Keep the scope set as narrow as the enabled tools require.
- Credentials (client ID/secret, refresh token) must be supplied via **environment variables** or a mounted secrets file — never hardcoded.
- Server should support **token refresh** automatically and fail gracefully with a clear error if the refresh token is invalid/expired.
- Design the auth layer as a separate module so it can later be swapped for per-user OAuth (multi-tenant) without touching tool logic.

Suggested env vars:
```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
GOOGLE_REDIRECT_URI   # only needed during initial token setup
```

Include a small standalone script/CLI (`scripts/get_refresh_token.js` or `.py`) to walk through the OAuth consent flow once and print the refresh token — this is a one-time setup step, not part of the running server.

---

## 6. Generic Design & MCP Compliance

To keep this usable by any AI agent, not just ours:

1. **Standard MCP tool manifest** — each tool must declare `name`, `description`, and a JSON Schema `inputSchema`, following MCP conventions so any client can introspect and call them.
2. **No agent-specific assumptions** in tool logic — inputs are plain data (strings, arrays, enums), not references to internal agent state.
3. **Structured, consistent error format** across all tools:
   ```json
   {
     "status": "error",
     "error_code": "AUTH_FAILED | INVALID_INPUT | NOT_FOUND | RATE_LIMITED | UPSTREAM_ERROR",
     "message": "human readable description",
     "details": { }
   }
   ```
   - **MCP result mapping:** Tool errors are returned as a normal `CallToolResult` with `isError: true`, not as a protocol-level (JSON-RPC) error. The structured object above should be placed in `structuredContent`, with a human-readable summary also mirrored in a `text` content block so clients that don't parse structured output still see the message. Reserve protocol-level errors for transport/serialization failures only.
4. **Structured output & schemas** — Each tool should declare an `outputSchema` (JSON Schema) describing its success payload (the `status: "sent" | "draft_created" | "appended"` objects in §4) and return that payload in `structuredContent`. This lets any client validate and consume results without parsing free text.
5. **Idempotency where possible** — e.g., allow an optional `idempotency_key` on `send_email` to avoid accidental duplicate sends on agent retries (nice-to-have).
6. **Logging** should be structured (JSON logs) and must **never log full email bodies or doc content** at info level — log metadata only (recipients, subject length, doc id, status). Sensitive content only at debug level, and secrets never logged.
7. **Configuration via environment**, not code, so the same server binary/image can be deployed by any team with their own Google Cloud credentials.

---

## 7. Suggested Tech Stack

- **Language:** TypeScript (Node.js) or Python — pick based on team preference; MCP SDKs exist for both (`@modelcontextprotocol/sdk` for TS, `mcp` package for Python).
- **Google API access:** `googleapis` npm package (Node) or `google-api-python-client` (Python).
- **Transport:** stdio transport for local/dev use; optionally support the **Streamable HTTP** transport (the current MCP remote transport, which supersedes the legacy HTTP+SSE transport) if the server needs to be reachable remotely.
- **Testing:** unit tests for each tool with mocked Google API responses; at least one integration test using a real test Gmail account/test Doc (guarded behind an env flag so it doesn't run in CI by default).

---

## 8. Project Structure (suggested)

```
mcp-gmail-docs-server/
├── src/
│   ├── server.ts                # MCP server bootstrap, tool registration
│   ├── auth/
│   │   └── googleAuth.ts        # OAuth client + token refresh
│   ├── tools/
│   │   ├── sendEmail.ts
│   │   ├── draftEmail.ts
│   │   ├── sendDraft.ts         # optional (nice-to-have, see §4.2)
│   │   └── appendToGoogleDoc.ts
│   ├── lib/
│   │   ├── gmailClient.ts
│   │   └── docsClient.ts
│   └── types/
│       └── errors.ts
├── scripts/
│   └── getRefreshToken.ts
├── tests/
│   └── ...
├── .env.example
├── package.json
└── README.md
```

---

## 9. Acceptance Criteria

- [ ] Server starts and registers the three required tools (`send_email`, `draft_email`, `append_to_google_doc`) via MCP tool discovery. Optional tools (e.g., `send_draft`) may also be registered but are not required for v1.
- [ ] `send_email` successfully sends a plain-text and an HTML email to a real test address.
- [ ] `draft_email` creates a visible draft in the Gmail account's Drafts folder.
- [ ] `append_to_google_doc` appends text to the end of a real test Google Doc, preserving existing content.
- [ ] Markdown formatting (bold, headings, bullets) in `append_to_google_doc` renders correctly in Google Docs.
- [ ] All errors return the structured error format in §6, not raw stack traces.
- [ ] No secrets appear in logs or committed files; `.env.example` documents all required vars.
- [ ] A second, unrelated AI agent (e.g., a simple script using the MCP client SDK) can connect to the server and successfully call all three tools using only the published tool schema — no code changes needed.
- [ ] README documents setup (Google Cloud project creation, enabling APIs, OAuth consent screen, getting refresh token, env vars, running the server).

---

## 10. Open Questions / Future Extensions

- Should `append_to_google_doc` support inserting at a specific location (not just end of doc) or replacing a placeholder token? (Future v2)
- Should we support creating a brand-new Google Doc from scratch, not just appending? (Future v2)
- Do we need multi-user OAuth (each agent/user brings their own Google account) or is a single shared service identity sufficient for now?
- Should rate limiting / backoff be handled inside the server, or left to the calling agent?
