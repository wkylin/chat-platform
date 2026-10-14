import { join } from "node:path";

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const config = {
  host: process.env.IM_HOST || "127.0.0.1",
  port: numberEnv("IM_PORT", 8787),
  domain: process.env.IM_XMPP_DOMAIN || "im.localhost",
  websocketUrl:
    process.env.IM_XMPP_WS_URL || "ws://localhost:8787/xmpp-websocket",
  jwtSecret: process.env.IM_JWT_SECRET || "local-match-chat-change-me",
  dataFile:
    process.env.IM_DATA_FILE || join(process.cwd(), "data", "match-chat.sqlite"),
  adminUsername: process.env.IM_ADMIN_USERNAME || "admin",
  adminPassword: process.env.IM_ADMIN_PASSWORD || "admin123!",
  maxMessageLength: numberEnv("IM_MAX_MESSAGE_LENGTH", 4000),
  sessionLifetimeSeconds: numberEnv("IM_SESSION_LIFETIME_SECONDS", 120),
};

export type ServerConfig = typeof config;
