import { createServer } from "node:http";
import { config } from "./config.js";
import { handleApi } from "./api.js";
import { ChatDatabase } from "./db.js";
import { XmppGateway, XmppSessionRegistry } from "./xmpp.js";

export function createMatchChatService() {
  const database = new ChatDatabase(
    config.dataFile,
    config.domain,
    config.adminUsername,
    config.adminPassword,
  );
  const sessions = new XmppSessionRegistry(config.sessionLifetimeSeconds);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, { database, sessions, config });
      return;
    }
    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Not found" }));
  });
  new XmppGateway(server, database, sessions, config);
  return { server, database };
}
