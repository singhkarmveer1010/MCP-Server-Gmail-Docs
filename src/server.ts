#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ensureAuthReady } from "./auth/googleAuth.js";
import { logger } from "./lib/logger.js";
import {
  handleSendEmail,
  sendEmailInputSchema,
  sendEmailOutputSchema,
} from "./tools/sendEmail.js";
import {
  handleDraftEmail,
  draftEmailInputSchema,
  draftEmailOutputSchema,
} from "./tools/draftEmail.js";
import {
  handleAppendToGoogleDoc,
  appendToGoogleDocInputSchema,
  appendToGoogleDocOutputSchema,
} from "./tools/appendToGoogleDoc.js";
import { AppError } from "./types/errors.js";

async function main(): Promise<void> {
  if (process.env.MCP_SKIP_AUTH === "1") {
    logger.warn("startup_auth_skipped", {
      reason: "MCP_SKIP_AUTH=1 (discovery/smoke only; tool calls will fail without credentials)",
    });
  } else {
    try {
      await ensureAuthReady();
    } catch (err) {
      const message = err instanceof AppError ? err.message : String(err);
      logger.error("startup_auth_failed", { message });
      console.error(`Fatal: ${message}`);
      process.exit(1);
    }
  }

  const server = new McpServer({
    name: "mcp-gmail-docs-server",
    version: "1.0.0",
  });

  server.registerTool(
    "send_email",
    {
      title: "Send Email",
      description:
        "Send an email immediately via Gmail. Supports plain text or HTML body, CC/BCC, attachments, and optional thread reply.",
      inputSchema: sendEmailInputSchema,
      outputSchema: sendEmailOutputSchema,
    },
    // ToolResult matches CallToolResult; cast avoids excess-property / index-signature friction with Zod inference
    async (args) => (await handleSendEmail(args)) as never,
  );

  server.registerTool(
    "draft_email",
    {
      title: "Draft Email",
      description:
        "Create a Gmail draft without sending. Same input schema as send_email (including optional thread_id).",
      inputSchema: draftEmailInputSchema,
      outputSchema: draftEmailOutputSchema,
    },
    async (args) => (await handleDraftEmail(args)) as never,
  );

  server.registerTool(
    "append_to_google_doc",
    {
      title: "Append to Google Doc",
      description:
        "Append plain text or basic markdown (headings, bold, bullets) to the end of an existing Google Doc.",
      inputSchema: appendToGoogleDocInputSchema,
      outputSchema: appendToGoogleDocOutputSchema,
    },
    async (args) => (await handleAppendToGoogleDoc(args)) as never,
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("mcp_server_started", {
    tools: ["send_email", "draft_email", "append_to_google_doc"],
    transport: "stdio",
  });

  const shutdown = async (signal: string) => {
    logger.info("mcp_server_shutdown", { signal });
    try {
      await server.close();
    } catch (err) {
      logger.error("mcp_server_shutdown_error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("mcp_server_fatal", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
