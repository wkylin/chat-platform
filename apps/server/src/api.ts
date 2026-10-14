import type { IncomingMessage, ServerResponse } from "node:http";
import { bearerToken, issueToken, verifyToken, type AuthClaims } from "./auth.js";
import type { ChatDatabase, MessageStatus, ReportStatus, RoomStatus, UserRecord, UserStatus } from "./db.js";
import type { ServerConfig } from "./config.js";
import type { XmppSessionStore } from "./xmpp.js";

interface ApiContext {
  database: ChatDatabase;
  sessions: XmppSessionStore;
  config: ServerConfig;
}

function json(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type, x-im-session-id",
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  });
  response.end(body);
}

function error(response: ServerResponse, status: number, message: string): void {
  json(response, status, { error: message });
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function currentUser(request: IncomingMessage, context: ApiContext): AuthClaims | null {
  const token = bearerToken(request.headers);
  return token ? verifyToken(token, context.config.jwtSecret) : null;
}

function requireUser(request: IncomingMessage, response: ServerResponse, context: ApiContext): AuthClaims | null {
  const claims = currentUser(request, context);
  if (!claims) error(response, 401, "Authentication required.");
  return claims;
}

function requireAdmin(request: IncomingMessage, response: ServerResponse, context: ApiContext): AuthClaims | null {
  const claims = requireUser(request, response, context);
  if (claims && claims.role !== "admin") {
    error(response, 403, "Administrator access required.");
    return null;
  }
  return claims;
}

function tokenFor(user: UserRecord | null, config: ServerConfig): string {
  if (!user) throw new Error("User was not found.");
  return issueToken(
    { sub: user.id, username: user.username, role: user.role },
    config.jwtSecret,
  );
}

function safeUser(user: UserRecord | null): unknown {
  if (!user) return null;
  return user;
}

export async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
): Promise<void> {
  if (request.method === "OPTIONS") {
    json(response, 204, null);
    return;
  }
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const parts = url.pathname.split("/").filter(Boolean);
  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      await context.database.ensureReady();
      json(response, 200, { ok: true, service: "match-chat-server", xmpp: context.config.websocketUrl });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/auth/register") {
      const input = await body(request);
      const username = stringField(input.username).toLowerCase();
      const password = stringField(input.password);
      const displayName = stringField(input.displayName) || username;
      if (!/^[a-z0-9._-]{3,32}$/.test(username)) return error(response, 400, "Username must be 3–32 characters.");
      if (password.length < 8) return error(response, 400, "Password must contain at least 8 characters.");
      if (await context.database.findUserByUsername(username)) return error(response, 409, "Username is already registered.");
      const user = await context.database.createUser(username, password, displayName);
      json(response, 201, { token: tokenFor(user, context.config), user: safeUser(user) });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      const input = await body(request);
      const user = await context.database.authenticate(stringField(input.username).toLowerCase(), stringField(input.password));
      if (!user) return error(response, 401, "Username or password is incorrect.");
      json(response, 200, { token: tokenFor(user, context.config), user });
      return;
    }

    const claims = requireUser(request, response, context);
    if (!claims) return;
    const user = await context.database.findUser(claims.sub);
    if (!user || user.status !== "active") return error(response, 403, "This account is unavailable.");

    if (request.method === "GET" && url.pathname === "/api/me") {
      json(response, 200, { user });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/rooms") {
      json(response, 200, { rooms: await context.database.listRooms() });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/rooms") {
      const input = await body(request);
      const name = stringField(input.name);
      const description = stringField(input.description);
      if (name.length < 2 || name.length > 80) return error(response, 400, "Room name must be 2–80 characters.");
      json(response, 201, { room: await context.database.createRoom(name, description, user.id) });
      return;
    }
    if (parts[0] === "api" && parts[1] === "rooms" && parts[2]) {
      const roomId = parts[2];
      const room = await context.database.getRoom(roomId);
      if (!room) return error(response, 404, "Room not found.");
      if (request.method === "POST" && parts[3] === "join") {
        if (room.status !== "active") return error(response, 409, "Room is not accepting new members.");
        json(response, 200, { room: await context.database.joinRoom(roomId, user.id) });
        return;
      }
      if (request.method === "GET" && parts[3] === "messages") {
        json(response, 200, { messages: await context.database.listMessages(roomId, Number(url.searchParams.get("limit") || 80)) });
        return;
      }
      if (request.method === "POST" && parts[3] === "reports") {
        if (!await context.database.isMember(roomId, user.id)) return error(response, 403, "Join the room before reporting.");
        const input = await body(request);
        const messageId = stringField(input.messageId);
        const reason = stringField(input.reason);
        const message = await context.database.findMessage(messageId);
        if (!message || message.roomId !== roomId) return error(response, 404, "Message not found.");
        if (!reason) return error(response, 400, "A report reason is required.");
        json(response, 201, { report: await context.database.createReport(messageId, roomId, user.id, reason) });
        return;
      }
    }
    if (request.method === "POST" && url.pathname === "/api/im/session") {
      const session = await context.sessions.create(user);
      json(response, 201, {
        imSessionId: session.id,
        xmppUsername: session.id,
        credential: session.credential,
        jid: `${user.id}@${context.config.domain}`,
        websocketUrl: context.config.websocketUrl,
        domain: context.config.domain,
        expiresInSeconds: context.sessions.lifetime,
      });
      return;
    }
    if (request.method === "DELETE" && url.pathname === "/api/im/session") {
      const sessionId = stringField(request.headers["x-im-session-id"]);
      if (sessionId) await context.sessions.revoke(sessionId);
      else await context.sessions.revokeUser(user.id);
      json(response, 204, null);
      return;
    }

    if (parts[0] === "api" && parts[1] === "admin") {
      const admin = requireAdmin(request, response, context);
      if (!admin) return;
      if (request.method === "GET" && parts[2] === "overview") {
        json(response, 200, { overview: await context.database.overview() });
        return;
      }
      if (request.method === "GET" && parts[2] === "rooms") {
        json(response, 200, { rooms: await context.database.listRooms() });
        return;
      }
      if (request.method === "PATCH" && parts[2] === "rooms" && parts[3]) {
        const input = await body(request);
        const status = stringField(input.status) as RoomStatus;
        if (!["active", "paused", "closed"].includes(status)) return error(response, 400, "Invalid room status.");
        json(response, 200, { room: await context.database.setRoomStatus(parts[3], status) });
        return;
      }
      if (request.method === "PATCH" && parts[2] === "messages" && parts[3]) {
        const input = await body(request);
        const status = stringField(input.status) as MessageStatus;
        if (!["visible", "removed"].includes(status)) return error(response, 400, "Invalid message status.");
        json(response, 200, { message: await context.database.setMessageStatus(parts[3], status) });
        return;
      }
      if (request.method === "GET" && parts[2] === "reports") {
        json(response, 200, { reports: await context.database.listReports(url.searchParams.get("status") || "all") });
        return;
      }
      if (request.method === "PATCH" && parts[2] === "reports" && parts[3]) {
        const input = await body(request);
        const status = stringField(input.status) as ReportStatus;
        if (!["open", "reviewed", "dismissed"].includes(status)) return error(response, 400, "Invalid report status.");
        json(response, 200, { report: await context.database.reviewReport(parts[3], status, stringField(input.note)) });
        return;
      }
      if (request.method === "GET" && parts[2] === "users") {
        json(response, 200, { users: await context.database.listUsers() });
        return;
      }
      if (request.method === "PATCH" && parts[2] === "users" && parts[3] && parts[4] === "status") {
        const input = await body(request);
        const status = stringField(input.status) as UserStatus;
        if (!["active", "suspended"].includes(status)) return error(response, 400, "Invalid user status.");
        if (parts[3] === user.id && status === "suspended") return error(response, 400, "Administrators cannot suspend their own account.");
        json(response, 200, { user: await context.database.setUserStatus(parts[3], status) });
        return;
      }
    }
    error(response, 404, "Route not found.");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unexpected server error.";
    if (url.pathname === "/api/auth/register" && /unique|duplicate key/i.test(message)) {
      return error(response, 409, "Username is already registered.");
    }
    console.error("[api] request failed", cause);
    error(response, 500, "Unexpected server error.");
  }
}
