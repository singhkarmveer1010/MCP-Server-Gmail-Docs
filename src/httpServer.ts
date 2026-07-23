import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { createMcpServer } from "./createServer.js";
import { logger } from "./lib/logger.js";

export interface HttpServerOptions {
  port: number;
  host?: string;
  authReady: boolean;
  authError?: string;
}

function requireAuthToken(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.MCP_AUTH_TOKEN?.trim();
  if (!expected) {
    next();
    return;
  }

  const header = req.header("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  const alt = req.header("x-mcp-auth-token")?.trim() ?? "";
  const provided = bearer || alt;

  if (provided !== expected) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Missing or invalid MCP_AUTH_TOKEN (Authorization: Bearer <token>).",
    });
    return;
  }
  next();
}

/**
 * Stateless Streamable HTTP MCP server for Railway / remote hosts.
 * Listens on 0.0.0.0:$PORT with GET /health and POST|GET|DELETE /mcp.
 */
export async function startHttpServer(options: HttpServerOptions): Promise<void> {
  const host = options.host ?? "0.0.0.0";
  const app = createMcpExpressApp({ host: "0.0.0.0" });

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      authReady: options.authReady,
      ...(options.authError ? { authError: options.authError } : {}),
      transport: "streamable-http",
      tools: ["send_email", "draft_email", "append_to_google_doc"],
    });
  });

  app.get("/", (_req, res) => {
    res.status(200).json({
      name: "mcp-gmail-docs-server",
      health: "/health",
      mcp: "/mcp",
    });
  });

  const handleMcp = async (req: Request, res: Response): Promise<void> => {
    if (!options.authReady) {
      res.status(503).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message:
            options.authError ??
            "Google auth not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN on Railway.",
        },
        id: null,
      });
      return;
    }

    const server = createMcpServer();
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      logger.error("mcp_http_request_error", {
        error: error instanceof Error ? error.message : String(error),
        requestId: randomUUID(),
      });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  };

  app.post("/mcp", requireAuthToken, (req, res) => void handleMcp(req, res));
  app.get("/mcp", requireAuthToken, (req, res) => void handleMcp(req, res));
  app.delete("/mcp", requireAuthToken, (req, res) => void handleMcp(req, res));

  await new Promise<void>((resolve, reject) => {
    const httpServer = app.listen(options.port, host, () => {
      logger.info("mcp_server_started", {
        tools: ["send_email", "draft_email", "append_to_google_doc"],
        transport: "streamable-http",
        host,
        port: options.port,
        authReady: options.authReady,
        mcpPath: "/mcp",
        healthPath: "/health",
      });
      resolve();
    });
    httpServer.on("error", reject);
  });
}
