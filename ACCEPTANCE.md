# Acceptance checklist (Phase 5)

Use this against a real test Gmail account and Google Doc. Do **not** commit message bodies, tokens, or personal addresses.

| # | Criterion | Pass? | Notes |
|---|---|---|---|
| 1 | Server starts; `tools/list` returns `send_email`, `draft_email`, `append_to_google_doc` | ☐ | `npm run smoke` |
| 2 | `send_email` plain-text to a real address | ☐ | |
| 3 | `send_email` HTML to a real address | ☐ | |
| 4 | `draft_email` creates a visible Drafts item | ☐ | |
| 5 | `append_to_google_doc` plain append preserves existing content | ☐ | |
| 6 | Markdown bold / headings / bullets render in Docs | ☐ | |
| 7 | Errors use structured `{ status, error_code, message }` (`isError: true`) | ☐ | Try bad `document_id` |
| 8 | No secrets in repo / info logs | ☐ | Confirm `.gitignore` |
| 9 | Unrelated MCP client can call tools from schema alone | ☐ | `scripts/smokeClient.ts` |
| 10 | README setup works for a new engineer | ☐ | |

### Live smoke command

```bash
# after .env + tokens.json are ready
$env:RUN_INTEGRATION="1"
$env:TEST_EMAIL_TO="your-test@example.com"
$env:TEST_DOCUMENT_ID="doc-id-from-url"
npm run smoke
```
