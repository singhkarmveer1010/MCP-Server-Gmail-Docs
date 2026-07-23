#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ensureAuthReady } from "./auth/googleAuth.js";
import { createMcpServer } from "./createServer.js";
import { startHttpServer } from "./httpServer.js";
import { logger } from "./lib/logger.js";
import { AppError } from "./types/errors.js";

function useHttpTransport(): boolean {
  const explicit = process.env.MCP_TRANSPORT?.trim().toLowerCase();
  if (explicit === "http" || explicit === "streamable-http") return true;
  if (explicit === "stdio") return false;
  // Railway (and most PaaS) inject PORT — prefer HTTP automatically
  return Boolean(process.env.PORT?.trim());
}

async function resolveAuth(): Promise<{ authReady: boolean; authError?: string }> {
  if (process.env.MCP_SKIP_AUTH === "1") {
    logger.warn("startup_auth_skipped", {
      reason: "MCP_SKIP_AUTH=1 (discovery/smoke only; tool calls will fail without credentials)",
    });
    return { authReady: false, authError: "MCP_SKIP_AUTH=1" };
  }

  try {
    await ensureAuthReady();
    return { authReady: true };
  } catch (err) {
    const message = err instanceof AppError ? err.message : String(err);
    return { authReady: false, authError: message };
  }
}

async function main(): Promise<void> {
  const httpMode = useHttpTransport();
  const { authReady, authError } = await resolveAuth();

  if (!httpMode) {
    // stdio: fail fast — Cursor cannot usefully start a broken auth process
    if (!authReady) {
      logger.error("startup_auth_failed", { message: authError });
      console.error(`Fatal: ${authError}`);
      console.error(
        "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN (or tokens.json).",
      );
      process.exit(1);
    }

    const server = createMcpServer();
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
    return;
  }

  // HTTP / Railway: keep process alive even if auth is missing so /health works
  if (!authReady) {
    logger.error("startup_auth_failed_http_degraded", {
      message: authError,
      hint: "Set Railway Variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN (and optional MCP_AUTH_TOKEN), then redeploy.",
    });
    console.error(`Warning: Google auth not ready — ${authError}`);
    console.error(
      "Set Railway Variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN — then redeploy.",
    );
  }

  const port = Number(process.env.PORT || 8080);
  await startHttpServer({
    port,
    host: "0.0.0.0",
    authReady,
    authError,
  });

  process.on("SIGINT", () => {
    logger.info("mcp_server_shutdown", { signal: "SIGINT" });
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    logger.info("mcp_server_shutdown", { signal: "SIGTERM" });
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error("mcp_server_fatal", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
