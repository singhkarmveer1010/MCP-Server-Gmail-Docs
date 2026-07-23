import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

export function createMcpServer(): McpServer {
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

  return server;
}
