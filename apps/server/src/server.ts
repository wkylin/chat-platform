import { createServer } from "node:http";
import { Redis } from "@upstash/redis";
import { config } from "./config.js";
import { handleApi } from "./api.js";
import { SQLiteChatDatabase } from "./db.js";
import { PostgresChatDatabase } from "./postgres-db.js";
import { RedisChatEventBroker, RedisXmppSessionRegistry, XmppGateway, XmppSessionRegistry } from "./xmpp.js";

export function createMatchChatService() {
  const database = config.databaseUrl
    ? new PostgresChatDatabase(config.databaseUrl, config.domain, config.adminUsername, config.adminPassword, config.syncAdminPassword)
    : new SQLiteChatDatabase(config.dataFile, config.domain, config.adminUsername, config.adminPassword);
  const redis = config.redisRestUrl && config.redisRestToken
    ? new Redis({ url: config.redisRestUrl, token: config.redisRestToken, enableTelemetry: false })
    : null;
  const sessions = redis
    ? new RedisXmppSessionRegistry(redis, config.sessionLifetimeSeconds)
    : new XmppSessionRegistry(config.sessionLifetimeSeconds);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, { database, sessions, config });
      return;
    }
    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Not found" }));
  });
  new XmppGateway(server, database, sessions, config, redis ? new RedisChatEventBroker(redis) : undefined);
  return { server, database };
}
