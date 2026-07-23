#!/usr/bin/env node
/**
 * One-time OAuth consent helper.
 * Opens a local HTTP server, walks the user through Google consent,
 * saves tokens to GOOGLE_STORAGE_TOKEN_PATH (default: tokens.json),
 * and prints the refresh token for optional .env use.
 */
import http from "node:http";
import { URL } from "node:url";
import { google } from "googleapis";
import { config as loadDotenv } from "dotenv";
import { resolveTokenStoragePath, SCOPES } from "../src/config.js";
import { writeStoredTokens } from "../src/auth/googleAuth.js";

loadDotenv();

const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const redirectUri =
  process.env.GOOGLE_REDIRECT_URI?.trim() || "http://localhost:3000/";
const storageTokenPath = resolveTokenStoragePath();

if (!clientId || !clientSecret) {
  console.error(
    "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env before running this script.",
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [...SCOPES],
});

const redirect = new URL(redirectUri);
const port = Number(redirect.port || 3000);
// Treat "" and "/" as root callback (Desktop clients often use http://localhost:PORT/)
const callbackPath = redirect.pathname === "" ? "/" : redirect.pathname;

console.log("\n=== Google OAuth — get refresh token ===\n");
console.log("1. Ensure this redirect URI is registered in your Google Cloud OAuth client:");
console.log(`   ${redirectUri}`);
console.log(`\n   Tokens will be saved to: ${storageTokenPath}`);
console.log("\n2. Open this URL in a browser and grant access:\n");
console.log(authUrl);
console.log("\nWaiting for callback on", redirectUri, "...\n");

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) {
      res.writeHead(400);
      res.end("Missing URL");
      return;
    }
    const reqUrl = new URL(req.url, `http://localhost:${port}`);
    if (reqUrl.pathname !== callbackPath) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const code = reqUrl.searchParams.get("code");
    const error = reqUrl.searchParams.get("error");
    if (error) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end(`OAuth error: ${error}`);
      console.error("OAuth error:", error);
      server.close();
      process.exit(1);
    }
    if (!code) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing authorization code");
      return;
    }

    const { tokens } = await oauth2Client.getToken(code);
    writeStoredTokens(storageTokenPath, tokens);

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      `<h1>Success</h1><p>Tokens saved to <code>${storageTokenPath}</code>. You can close this window.</p>`,
    );

    console.log(`\nTokens saved to ${storageTokenPath}\n`);
    if (tokens.refresh_token) {
      console.log("--- Optional: also add to .env ---\n");
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log("\n----------------------------------\n");
    } else {
      console.log(
        "No refresh_token returned. Revoke app access at https://myaccount.google.com/permissions and retry with prompt=consent.",
      );
      console.log("Tokens received:", JSON.stringify({
        hasAccessToken: Boolean(tokens.access_token),
        expiry_date: tokens.expiry_date,
      }));
    }
    server.close();
    process.exit(0);
  } catch (err) {
    console.error("Token exchange failed:", err);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Token exchange failed — see terminal.");
    server.close();
    process.exit(1);
  }
});

server.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
