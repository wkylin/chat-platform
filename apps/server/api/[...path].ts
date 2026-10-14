import { createMatchChatService } from "../src/server.js";

// Vercel routes REST requests and the XMPP WebSocket upgrade through the same
// function so a warm instance can reuse the same database/session objects.
const { server } = createMatchChatService();

export default server;
