import { config } from "./config.js";
import { createMatchChatService } from "./server.js";

const { server, database } = createMatchChatService();

server.listen(config.port, config.host, () => {
  console.log(`Match Chat API listening on http://${config.host}:${config.port}`);
  console.log(`XMPP WebSocket listening on ${config.websocketUrl}`);
  if (process.env.VERCEL !== "1") {
    console.log(`Admin login: ${config.adminUsername} / ${config.adminPassword}`);
  }
});

function shutdown(): void {
  database.close();
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
