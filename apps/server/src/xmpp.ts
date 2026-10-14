import { randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { ChatDatabase, roomJid, type UserRecord } from "./db.js";
import type { ServerConfig } from "./config.js";

const STREAM_NAMESPACE = "http://etherx.jabber.org/streams";
const FRAMING_NAMESPACE = "urn:ietf:params:xml:ns:xmpp-framing";
const SASL_NAMESPACE = "urn:ietf:params:xml:ns:xmpp-sasl";
const BIND_NAMESPACE = "urn:ietf:params:xml:ns:xmpp-bind";
const MUC_NAMESPACE = "http://jabber.org/protocol/muc";
const MUC_USER_NAMESPACE = "http://jabber.org/protocol/muc#user";
const META_NAMESPACE = "urn:match-chat:meta";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function attribute(xml: string, name: string): string {
  const match = xml.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*([\\"'])(.*?)\\1`, "s"));
  return match ? decodeXml(match[2]) : "";
}

function childText(xml: string, name: string): string {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function childBody(xml: string): string {
  return childText(xml, "body");
}

function toText(raw: RawData): string {
  return typeof raw === "string" ? raw : Buffer.isBuffer(raw) ? raw.toString("utf8") : Buffer.from(raw as ArrayBuffer).toString("utf8");
}

function openingTagEnd(value: string, start: number): number {
  let quote = "";
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return -1;
}

/** Extract complete top-level client stanzas from a WebSocket frame buffer. */
function extractStanzas(input: string): { stanzas: string[]; rest: string } {
  const stanzas: string[] = [];
  let buffer = input;
  while (buffer.length) {
    buffer = buffer.replace(/^\s+/, "");
    if (buffer.startsWith("<?xml")) {
      const declarationEnd = buffer.indexOf("?>");
      if (declarationEnd < 0) return { stanzas, rest: buffer };
      buffer = buffer.slice(declarationEnd + 2);
      continue;
    }
    const start = buffer.match(/^<(open|auth|iq|presence|message|close)\b/i);
    if (!start) {
      const nextTag = buffer.indexOf("<");
      if (nextTag < 0) return { stanzas, rest: buffer };
      buffer = buffer.slice(nextTag);
      // XMPP clients may send stream-management or extension stanzas such as
      // <r/> and <enable/> after authentication. They are not application
      // messages, but they must still advance the parser or an unknown tag
      // would spin the Node event loop forever.
      const generic = buffer.match(/^<([A-Za-z_:][\w:.-]*)(?:\s|\/?>)/);
      if (!generic) return { stanzas, rest: buffer };
      const genericEnd = buffer.indexOf(">", generic[0].length - 1);
      if (genericEnd < 0) return { stanzas, rest: buffer };
      if (buffer[genericEnd - 1] === "/") {
        buffer = buffer.slice(genericEnd + 1);
        continue;
      }
      const genericClose = buffer.indexOf(`</${generic[1]}>`, genericEnd + 1);
      buffer = genericClose >= 0
        ? buffer.slice(genericClose + generic[1].length + 3)
        : buffer.slice(genericEnd + 1);
      continue;
    }
    const tag = start[1];
    const rootOpeningEnd = openingTagEnd(buffer, start[0].length);
    if (rootOpeningEnd < 0) return { stanzas, rest: buffer };
    if (buffer[rootOpeningEnd - 1] === "/") {
      stanzas.push(buffer.slice(0, rootOpeningEnd + 1));
      buffer = buffer.slice(rootOpeningEnd + 1);
      continue;
    }
    const closingTag = buffer.indexOf(`</${tag}>`, rootOpeningEnd + 1);
    if (closingTag < 0) return { stanzas, rest: buffer };
    const end = closingTag + tag.length + 3;
    stanzas.push(buffer.slice(0, end));
    buffer = buffer.slice(end);
  }
  return { stanzas, rest: "" };
}

interface SessionRecord {
  id: string;
  userId: string;
  username: string;
  credential: string;
  expiresAt: number;
}

export class XmppSessionRegistry {
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(private readonly lifetimeSeconds: number) {}

  create(user: UserRecord): SessionRecord {
    const session: SessionRecord = {
      id: `im_${randomUUID().replaceAll("-", "").slice(0, 18)}`,
      userId: user.id,
      username: user.username,
      credential: randomBytes(24).toString("base64url"),
      expiresAt: Date.now() + this.lifetimeSeconds * 1000,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  authenticate(username: string, credential: string): SessionRecord | null {
    const session = this.sessions.get(username);
    if (!session || session.expiresAt < Date.now() || session.credential !== credential) {
      if (session?.expiresAt && session.expiresAt < Date.now()) this.sessions.delete(username);
      return null;
    }
    return session;
  }

  revoke(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  revokeUser(userId: string): void {
    for (const [id, session] of this.sessions) if (session.userId === userId) this.sessions.delete(id);
  }

  get lifetime(): number {
    return this.lifetimeSeconds;
  }
}

interface XmppConnection {
  socket: WebSocket;
  buffer: string;
  phase: "await-open" | "await-auth" | "await-restart" | "await-bind" | "bound";
  session: SessionRecord | null;
  user: UserRecord | null;
  fullJid: string;
  nickname: string;
  joinedRooms: Set<string>;
}

function roomIdFromJid(jid: string): string | null {
  const local = jid.split("@", 1)[0] ?? "";
  return local.startsWith("room-") ? local.slice(5) : null;
}

function roomIdFromConnection(connection: XmppConnection, jid: string): string | null {
  const roomId = roomIdFromJid(jid);
  return roomId && connection.joinedRooms.has(roomId) ? roomId : null;
}

export class XmppGateway {
  private readonly gateway: WebSocketServer;
  private readonly connections = new Set<XmppConnection>();
  private readonly roomConnections = new Map<string, Set<XmppConnection>>();

  constructor(
    server: Server,
    private readonly database: ChatDatabase,
    private readonly sessions: XmppSessionRegistry,
    private readonly config: ServerConfig,
  ) {
    this.gateway = new WebSocketServer({ noServer: true });
    server.on("upgrade", (request, socket, head) => this.handleUpgrade(request, socket, head));
  }

  private handleUpgrade(
    request: IncomingMessage,
    socket: NodeJS.WritableStream & { destroy: () => void },
    head: Buffer,
  ): void {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname !== this.config.websocketPath) {
      socket.destroy();
      return;
    }
    this.gateway.handleUpgrade(request, socket as never, head, (websocket) => {
      const connection: XmppConnection = {
        socket: websocket,
        buffer: "",
        phase: "await-open",
        session: null,
        user: null,
        fullJid: "",
        nickname: "",
        joinedRooms: new Set(),
      };
      this.connections.add(connection);
      websocket.on("message", (raw) => this.receive(connection, toText(raw)));
      websocket.on("close", () => this.cleanup(connection));
      websocket.on("error", () => this.cleanup(connection));
    });
  }

  private receive(connection: XmppConnection, raw: string): void {
    connection.buffer += raw;
    const result = extractStanzas(connection.buffer);
    connection.buffer = result.rest;
    if (process.env.IM_DEBUG_XMPP === "1" && result.stanzas.length) {
      console.log("[xmpp] inbound", result.stanzas.map((stanza) => stanza.slice(0, 80)));
    }
    for (const stanza of result.stanzas) void this.handleStanza(connection, stanza);
  }

  private async handleStanza(connection: XmppConnection, stanza: string): Promise<void> {
    if (stanza.startsWith("<open")) {
      this.handleOpen(connection, stanza);
    } else if (stanza.startsWith("<auth")) {
      this.handleAuth(connection, stanza);
    } else if (stanza.startsWith("<iq")) {
      this.handleIq(connection, stanza);
    } else if (stanza.startsWith("<presence")) {
      this.handlePresence(connection, stanza);
    } else if (stanza.startsWith("<message")) {
      this.handleMessage(connection, stanza);
    } else if (stanza.startsWith("<close")) {
      await this.closeConnection(connection);
    }
  }

  private handleOpen(connection: XmppConnection, stanza: string): void {
    if (connection.phase === "await-open") {
      connection.phase = "await-auth";
      this.send(connection, `<open from="${this.config.domain}" id="${randomUUID()}" version="1.0" xml:lang="en" xmlns="${FRAMING_NAMESPACE}"/>`);
      this.send(connection, `<stream:features xmlns:stream="${STREAM_NAMESPACE}"><mechanisms xmlns="${SASL_NAMESPACE}"><mechanism>PLAIN</mechanism></mechanisms></stream:features>`);
      return;
    }
    if (connection.phase === "await-restart") {
      connection.phase = "await-bind";
      this.send(connection, `<open from="${this.config.domain}" id="${randomUUID()}" version="1.0" xml:lang="en" xmlns="${FRAMING_NAMESPACE}"/>`);
      this.send(connection, `<stream:features xmlns:stream="${STREAM_NAMESPACE}"><bind xmlns="${BIND_NAMESPACE}"/></stream:features>`);
    }
  }

  private handleAuth(connection: XmppConnection, stanza: string): void {
    if (connection.phase !== "await-auth") return;
    const mechanism = attribute(stanza, "mechanism");
    const encoded = childText(stanza, "auth") || stanza.replace(/^<[\s\S]*?>/, "").replace(/<\/auth>$/, "");
    if (mechanism !== "PLAIN") {
      this.send(connection, `<failure xmlns="${SASL_NAMESPACE}"><invalid-mechanism/></failure>`);
      return;
    }
    let username = "";
    let credential = "";
    try {
      const parts = Buffer.from(encoded, "base64").toString("utf8").split("\0");
      username = parts.at(-2) || "";
      credential = parts.at(-1) || "";
    } catch {
      // Invalid base64 is handled as an authentication failure below.
    }
    const session = this.sessions.authenticate(username, credential);
    const user = session ? this.database.findUser(session.userId) : null;
    if (!session || !user || user.status !== "active") {
      this.send(connection, `<failure xmlns="${SASL_NAMESPACE}"><not-authorized/></failure>`);
      return;
    }
    connection.session = session;
    connection.user = user;
    connection.phase = "await-restart";
    this.send(connection, `<success xmlns="${SASL_NAMESPACE}"/>`);
  }

  private handleIq(connection: XmppConnection, stanza: string): void {
    const id = attribute(stanza, "id");
    const type = attribute(stanza, "type");
    if (connection.phase === "await-bind" && stanza.includes(`xmlns="${BIND_NAMESPACE}"`)) {
      const requestedResource = childText(stanza, "resource") || connection.session?.id || "web";
      const username = connection.user?.id || connection.session?.userId || "anonymous";
      connection.fullJid = `${username}@${this.config.domain}/${requestedResource}`;
      connection.nickname = `u-${username.slice(0, 10)}`;
      connection.phase = "bound";
      this.send(connection, `<iq type="result" id="${escapeXml(id)}"><bind xmlns="${BIND_NAMESPACE}"><jid>${escapeXml(connection.fullJid)}</jid></bind></iq>`);
      return;
    }
    if (connection.phase === "bound" && type === "get") {
      this.send(connection, `<iq type="result" id="${escapeXml(id)}"/>`);
    } else if (connection.phase === "bound" && type === "set") {
      this.send(connection, `<iq type="result" id="${escapeXml(id)}"/>`);
    }
  }

  private handlePresence(connection: XmppConnection, stanza: string): void {
    if (connection.phase !== "bound" || !connection.user) return;
    const target = attribute(stanza, "to");
    const roomId = roomIdFromJid(target);
    if (!roomId) return;
    const room = this.database.getRoom(roomId);
    if (!room || room.status !== "active") {
      this.send(connection, `<presence type="error" to="${escapeXml(connection.fullJid)}"><error type="cancel"><service-unavailable/></error></presence>`);
      return;
    }
    const unavailable = attribute(stanza, "type") === "unavailable";
    if (unavailable) {
      this.leaveRoom(connection, roomId);
      return;
    }
    this.database.joinRoom(roomId, connection.user.id);
    connection.joinedRooms.add(roomId);
    let members = this.roomConnections.get(roomId);
    if (!members) {
      members = new Set();
      this.roomConnections.set(roomId, members);
    }
    members.add(connection);
    this.send(connection, `<presence from="${escapeXml(`${room.jid}/${connection.nickname}`)}" to="${escapeXml(connection.fullJid)}"><x xmlns="${MUC_USER_NAMESPACE}"><item affiliation="member" role="participant" jid="${escapeXml(connection.fullJid)}"/><status code="110"/></x></presence>`);
    this.broadcastPresence(roomId, connection, "available");
  }

  private handleMessage(connection: XmppConnection, stanza: string): void {
    const target = attribute(stanza, "to");
    const roomId = roomIdFromConnection(connection, target);
    const body = childBody(stanza).trim();
    if (process.env.IM_DEBUG_XMPP === "1") {
      console.log("[xmpp] message", {
        phase: connection.phase,
        user: connection.user?.id,
        target,
        roomId,
        joinedRooms: [...connection.joinedRooms],
        bodyLength: body.length,
      });
    }
    if (connection.phase !== "bound" || !connection.user) return;
    if (!roomId || !body || body.length > this.config.maxMessageLength) return;
    const room = this.database.getRoom(roomId);
    if (!room || room.status !== "active") return;
    const message = this.database.createMessage(roomId, connection.user.id, body);
    const from = `${room.jid}/${connection.nickname}`;
    const payload = `<message from="${escapeXml(from)}" type="groupchat" id="${escapeXml(message.id)}"><body>${escapeXml(message.body)}</body><x xmlns="${META_NAMESPACE}" userId="${escapeXml(message.userId)}" displayName="${escapeXml(message.displayName)}" createdAt="${escapeXml(message.createdAt)}"/></message>`;
    for (const member of this.roomConnections.get(roomId) || []) this.send(member, payload);
  }

  private broadcastPresence(roomId: string, joining: XmppConnection, type: "available" | "unavailable"): void {
    const room = this.database.getRoom(roomId);
    if (!room) return;
    const from = `${room.jid}/${joining.nickname}`;
    const payload = `<presence from="${escapeXml(from)}" type="${type}"><x xmlns="${MUC_USER_NAMESPACE}"><item affiliation="member" role="${type === "available" ? "participant" : "none"}" jid="${escapeXml(joining.fullJid)}"/></x></presence>`;
    for (const member of this.roomConnections.get(roomId) || []) if (member !== joining) this.send(member, payload);
  }

  private leaveRoom(connection: XmppConnection, roomId: string): void {
    const members = this.roomConnections.get(roomId);
    if (members) {
      members.delete(connection);
      if (!members.size) this.roomConnections.delete(roomId);
    }
    connection.joinedRooms.delete(roomId);
    this.broadcastPresence(roomId, connection, "unavailable");
  }

  private send(connection: XmppConnection, payload: string): void {
    if (connection.socket.readyState === WebSocket.OPEN) connection.socket.send(payload);
  }

  private async closeConnection(connection: XmppConnection): Promise<void> {
    await connection.socket.close();
    this.cleanup(connection);
  }

  private cleanup(connection: XmppConnection): void {
    if (!this.connections.delete(connection)) return;
    for (const roomId of connection.joinedRooms) this.leaveRoom(connection, roomId);
    // Keep the short-lived credential available for a reconnect. Explicit
    // logout revokes it through DELETE /api/im/session; otherwise the session
    // expires naturally after the configured lifetime.
  }
}
