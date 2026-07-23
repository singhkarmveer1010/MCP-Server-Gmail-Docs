#!/usr/bin/env node
/**
 * Generic MCP client smoke test — proves any client can discover (and optionally call) tools.
 *
 * Usage:
 *   npm run smoke
 *     → tools/list (starts server with MCP_SKIP_AUTH=1 so discovery works without Google creds)
 *
 *   RUN_INTEGRATION=1 TEST_EMAIL_TO=... TEST_DOCUMENT_ID=... npm run smoke
 *     → also calls send_email, draft_email, append_to_google_doc against live APIs
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

loadDotenv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const runIntegration = process.env.RUN_INTEGRATION === "1";

const REQUIRED_TOOLS = ["send_email", "draft_email", "append_to_google_doc"] as const;

async function main(): Promise<void> {
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
  };

  if (!runIntegration) {
    env.MCP_SKIP_AUTH = "1";
  } else {
    delete env.MCP_SKIP_AUTH;
    for (const key of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]) {
      if (!process.env[key]) {
        throw new Error(`RUN_INTEGRATION=1 requires ${key}`);
      }
    }
    if (!process.env.TEST_EMAIL_TO || !process.env.TEST_DOCUMENT_ID) {
      throw new Error("RUN_INTEGRATION=1 requires TEST_EMAIL_TO and TEST_DOCUMENT_ID");
    }
  }

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", path.join(root, "src", "server.ts")],
    cwd: root,
    env,
    stderr: "pipe",
  });

  transport.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
  });

  const client = new Client({ name: "smoke-client", version: "1.0.0" });
  await client.connect(transport);

  try {
    const listed = await client.listTools();
    const names = listed.tools.map((t) => t.name).sort();
    console.log("tools/list:", names);

    for (const required of REQUIRED_TOOLS) {
      if (!names.includes(required)) {
        throw new Error(`Missing tool: ${required}. Got: ${names.join(", ")}`);
      }
    }
    console.log("OK: all three required tools are discoverable");

    if (!runIntegration) {
      console.log("Skipping live tool calls (set RUN_INTEGRATION=1 to enable).");
      return;
    }

    const to = process.env.TEST_EMAIL_TO!;
    const documentId = process.env.TEST_DOCUMENT_ID!;

    const sent = await client.callTool({
      name: "send_email",
      arguments: {
        to,
        subject: `[MCP smoke] send_email ${new Date().toISOString()}`,
        body: "Smoke test plain-text body from mcp-gmail-docs-server.",
        body_type: "text",
      },
    });
    console.log("send_email:", JSON.stringify(sent.structuredContent ?? sent, null, 2));
    if (sent.isError) throw new Error("send_email failed");

    const drafted = await client.callTool({
      name: "draft_email",
      arguments: {
        to,
        subject: `[MCP smoke] draft_email ${new Date().toISOString()}`,
        body: "<p>Smoke <b>HTML</b> draft</p>",
        body_type: "html",
      },
    });
    console.log("draft_email:", JSON.stringify(drafted.structuredContent ?? drafted, null, 2));
    if (drafted.isError) throw new Error("draft_email failed");

    const appended = await client.callTool({
      name: "append_to_google_doc",
      arguments: {
        document_id: documentId,
        content: `## MCP smoke\n\nAppended at **${new Date().toISOString()}**\n\n- item one\n- item two`,
        format: "markdown",
      },
    });
    console.log(
      "append_to_google_doc:",
      JSON.stringify(appended.structuredContent ?? appended, null, 2),
    );
    if (appended.isError) throw new Error("append_to_google_doc failed");

    console.log("OK: integration smoke calls succeeded");
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("Smoke failed:", err);
  process.exit(1);
});
