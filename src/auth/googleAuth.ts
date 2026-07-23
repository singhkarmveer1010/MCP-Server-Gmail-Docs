import fs from "node:fs";
import { google } from "googleapis";
import type { gmail_v1, docs_v1 } from "googleapis";
import { loadGoogleConfig, SCOPES } from "../config.js";
import { AppError } from "../types/errors.js";
import { logger } from "../lib/logger.js";

// googleapis nests its own google-auth-library copy; avoid cross-package OAuth2Client type clash
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OAuth2ClientLike = any;

export interface StoredTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string | null;
  token_type?: string | null;
  expiry_date?: number | null;
  id_token?: string | null;
}

let oauth2Client: OAuth2ClientLike | null = null;

export function readStoredTokens(filePath: string): StoredTokens | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as StoredTokens;
  } catch (err) {
    throw new AppError(
      "AUTH_FAILED",
      `Failed to read token file at ${filePath}`,
      { error: err instanceof Error ? err.message : String(err) },
    );
  }
}

export function writeStoredTokens(filePath: string, tokens: StoredTokens): void {
  const existing = readStoredTokens(filePath) ?? {};
  const merged: StoredTokens = {
    ...existing,
    ...tokens,
    // Never drop an existing refresh_token if a refresh response omits it
    refresh_token: tokens.refresh_token ?? existing.refresh_token ?? null,
  };
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), "utf8");
  logger.debug("tokens_persisted", { path: filePath });
}

export function getAuthClient(): OAuth2ClientLike {
  if (oauth2Client) return oauth2Client;

  const cfg = loadGoogleConfig();
  const client = new google.auth.OAuth2(
    cfg.clientId,
    cfg.clientSecret,
    cfg.redirectUri,
  );

  const stored = readStoredTokens(cfg.storageTokenPath);
  const refreshToken = stored?.refresh_token || cfg.refreshToken;
  if (!refreshToken) {
    throw new AppError(
      "AUTH_FAILED",
      `No refresh token found. Run npm run get-refresh-token (writes ${cfg.storageTokenPath}) or set GOOGLE_REFRESH_TOKEN.`,
      { storageTokenPath: cfg.storageTokenPath },
    );
  }

  client.setCredentials({
    access_token: stored?.access_token ?? undefined,
    expiry_date: stored?.expiry_date ?? undefined,
    scope: stored?.scope ?? undefined,
    token_type: stored?.token_type ?? undefined,
    id_token: stored?.id_token ?? undefined,
    refresh_token: refreshToken,
  });

  client.on("tokens", (tokens: StoredTokens) => {
      logger.debug("google_tokens_refreshed", {
        hasAccessToken: Boolean(tokens.access_token),
        expiryDate: tokens.expiry_date ?? null,
      });
      try {
        writeStoredTokens(cfg.storageTokenPath, tokens);
      } catch (err) {
        logger.warn("tokens_persist_failed", {
          path: cfg.storageTokenPath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

  oauth2Client = client;
  return client;
}

/** Reset cached client (useful in tests). */
export function resetAuthClient(): void {
  oauth2Client = null;
}

export function getGmail(): gmail_v1.Gmail {
  return google.gmail({ version: "v1", auth: getAuthClient() });
}

export function getDocs(): docs_v1.Docs {
  return google.docs({ version: "v1", auth: getAuthClient() });
}

export { SCOPES };

/**
 * Ensure credentials can obtain an access token.
 * Call at startup to fail fast on bad refresh tokens.
 */
export async function ensureAuthReady(): Promise<void> {
  try {
    const client = getAuthClient();
    const tokenResponse = await client.getAccessToken();
    if (!tokenResponse.token) {
      throw new AppError(
        "AUTH_FAILED",
        "Failed to obtain Google access token from refresh token.",
      );
    }
    logger.info("google_auth_ready", { scopes: SCOPES.length });
  } catch (err) {
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new AppError(
      "AUTH_FAILED",
      `Google OAuth failed: ${message}. Re-run npm run get-refresh-token.`,
    );
  }
}
