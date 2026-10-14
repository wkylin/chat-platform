import { join } from "node:path";

const onVercel = process.env.VERCEL === "1";
const deploymentHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;

if (onVercel && !process.env.IM_JWT_SECRET) {
  throw new Error("IM_JWT_SECRET must be set in the Vercel project environment.");
}
if (onVercel && !process.env.IM_ADMIN_PASSWORD) {
  throw new Error("IM_ADMIN_PASSWORD must be set in the Vercel project environment.");
}

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const config = {
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
  dataFile:
    process.env.IM_DATA_FILE || (onVercel ? "/tmp/match-chat.sqlite" : join(process.cwd(), "data", "match-chat.sqlite")),
  adminUsername: process.env.IM_ADMIN_USERNAME || "admin",
  adminPassword: process.env.IM_ADMIN_PASSWORD || "admin123!",
  maxMessageLength: numberEnv("IM_MAX_MESSAGE_LENGTH", 4000),
  sessionLifetimeSeconds: numberEnv("IM_SESSION_LIFETIME_SECONDS", 120),
};

export type ServerConfig = typeof config;
