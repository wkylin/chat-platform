import { join } from "node:path";

const onVercel = process.env.VERCEL === "1";
const deploymentHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
const redisRestUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const redisRestToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";

if (onVercel && !process.env.IM_JWT_SECRET) {
  throw new Error("IM_JWT_SECRET must be set in the Vercel project environment.");
}
if (onVercel && !process.env.IM_ADMIN_PASSWORD) {
  throw new Error("IM_ADMIN_PASSWORD must be set in the Vercel project environment.");
}
if (onVercel && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be connected from Neon in the Vercel project environment.");
}
if (onVercel && (!redisRestUrl || !redisRestToken)) {
  throw new Error("Connect the Upstash Redis REST URL and token in the Vercel project environment.");
}

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const config = {
  onVercel,
  host: process.env.IM_HOST || "127.0.0.1",
  port: numberEnv("IM_PORT", 8787),
  domain: process.env.IM_XMPP_DOMAIN || deploymentHost || "im.localhost",
  websocketUrl:
    process.env.IM_XMPP_WS_URL ||
    (deploymentHost
      ? `wss://${deploymentHost}/api/xmpp-websocket`
      : "ws://localhost:8787/xmpp-websocket"),
  websocketPath: process.env.IM_XMPP_WS_PATH || (onVercel ? "/api/xmpp-websocket" : "/xmpp-websocket"),
  jwtSecret: process.env.IM_JWT_SECRET || "local-match-chat-change-me",
  dataFile: process.env.IM_DATA_FILE || join(process.cwd(), "data", "match-chat.sqlite"),
  databaseUrl: process.env.DATABASE_URL || "",
  redisRestUrl,
  redisRestToken,
  adminUsername: process.env.IM_ADMIN_USERNAME || "admin",
  adminPassword: process.env.IM_ADMIN_PASSWORD || "admin123!",
  maxMessageLength: numberEnv("IM_MAX_MESSAGE_LENGTH", 4000),
  // Match the API token lifetime so the XMPP client can reconnect after
  // Vercel's WebSocket duration limit without requesting a new credential.
  sessionLifetimeSeconds: numberEnv("IM_SESSION_LIFETIME_SECONDS", 60 * 60 * 24 * 7),
};

export type ServerConfig = typeof config;
