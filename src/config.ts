import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { AppError } from "./types/errors.js";

loadDotenv();

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  /** Optional; used when tokens file has no refresh_token yet. */
  refreshToken?: string;
  redirectUri: string;
  /** Absolute or project-relative path for persisted OAuth tokens (e.g. tokens.json). */
  storageTokenPath: string;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AppError(
      "AUTH_FAILED",
      `Missing required environment variable: ${name}. See .env.example.`,
      { envVar: name },
    );
  }
  return value;
}

export function resolveTokenStoragePath(): string {
  const raw =
    process.env.GOOGLE_TOKEN_STORAGE_PATH?.trim() ||
    process.env.GOOGLE_STORAGE_TOKEN_PATH?.trim() ||
    "tokens.json";
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

export function loadGoogleConfig(): GoogleConfig {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim() || undefined;
  return {
    clientId: requireEnv("GOOGLE_CLIENT_ID"),
    clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
    refreshToken,
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI?.trim() || "http://localhost:3000/",
    storageTokenPath: resolveTokenStoragePath(),
  };
}

export const SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/documents",
] as const;
