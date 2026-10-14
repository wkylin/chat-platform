import { createServer } from "node:http";
import { config } from "./config.js";
import { handleApi } from "./api.js";
import { ChatDatabase } from "./db.js";
import { XmppGateway, XmppSessionRegistry } from "./xmpp.js";

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

server.listen(config.port, config.host, () => {
  console.log(`Match Chat API listening on http://${config.host}:${config.port}`);
  console.log(`XMPP WebSocket listening on ${config.websocketUrl}`);
  console.log(`Admin login: ${config.adminUsername} / ${config.adminPassword}`);
});

function shutdown(): void {
  database.close();
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
