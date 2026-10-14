import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { AuthClaims } from "./auth.js";

export type Role = "user" | "admin";
export type UserStatus = "active" | "suspended";
export type RoomStatus = "active" | "paused" | "closed";
export type MessageStatus = "visible" | "removed";
export type ReportStatus = "open" | "reviewed" | "dismissed";

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
}

export interface RoomRecord {
  id: string;
  name: string;
  description: string;
  jid: string;
  status: RoomStatus;
  ownerId: string;
  memberCount: number;
  messageCount: number;
  createdAt: string;
}

export interface MessageRecord {
  id: string;
  roomId: string;
  userId: string;
  displayName: string;
  body: string;
  status: MessageStatus;
  createdAt: string;
}

export interface ReportRecord {
  id: string;
  messageId: string;
  roomId: string;
  reporterId: string;
  reporterName: string;
  messageBody: string;
  reason: string;
  status: ReportStatus;
  note: string;
  createdAt: string;
  reviewedAt: string | null;
}

export interface OverviewRecord {
  totalUsers: number;
  activeUsers: number;
  activeRooms: number;
  messagesToday: number;
  openReports: number;
}

type Row = Record<string, unknown>;

function now(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number(value) || 0;
}

function passwordHash(password: string): string {
  const salt = randomUUID();
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

function passwordMatches(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBytes = Buffer.from(expected, "hex");
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
}

export function roomJid(roomId: string, domain = "im.localhost"): string {
  return `room-${roomId}@conference.${domain}`;
}

export class ChatDatabase {
  private readonly database: DatabaseSync;
  private readonly domain: string;

  constructor(file: string, domain: string, adminUsername: string, adminPassword: string) {
    mkdirSync(dirname(file), { recursive: true });
    this.database = new DatabaseSync(file);
    this.domain = domain;
    this.database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        owner_id TEXT NOT NULL REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS room_members (
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TEXT NOT NULL,
        PRIMARY KEY (room_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id),
        body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'visible',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        reporter_id TEXT NOT NULL REFERENCES users(id),
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        reviewed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS messages_room_created ON messages(room_id, created_at);
      CREATE INDEX IF NOT EXISTS reports_status_created ON reports(status, created_at);
    `);
    this.seed(adminUsername, adminPassword);
  }

  private seed(adminUsername: string, adminPassword: string): void {
    const admin = this.findUserByUsername(adminUsername);
    const adminId = admin?.id ?? id("usr");
    if (!admin) {
      this.database
        .prepare(
          `INSERT INTO users (id, username, display_name, password_hash, role, status, created_at)
           VALUES (?, ?, ?, ?, 'admin', 'active', ?)`,
        )
        .run(adminId, adminUsername, "Control Room", passwordHash(adminPassword), now());
    }
    const count = numberValue(this.database.prepare("SELECT COUNT(*) AS count FROM rooms").get()?.count);
    if (!count) {
      const roomId = id("room");
      this.database
        .prepare(
          `INSERT INTO rooms (id, name, description, owner_id, status, created_at)
           VALUES (?, ?, ?, ?, 'active', ?)`,
        )
        .run(roomId, "Signal Commons", "A focused room for live conversation.", adminId, now());
      this.database
        .prepare("INSERT INTO room_members (room_id, user_id, joined_at) VALUES (?, ?, ?)")
        .run(roomId, adminId, now());
    }
  }

  close(): void {
    this.database.close();
  }

  createUser(username: string, password: string, displayName: string, role: Role = "user"): UserRecord {
    const userId = id("usr");
    const createdAt = now();
    this.database
      .prepare(
        `INSERT INTO users (id, username, display_name, password_hash, role, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      )
      .run(userId, username, displayName || username, passwordHash(password), role, createdAt);
    return this.findUser(userId)!;
  }

  findUser(userId: string): UserRecord | null {
    const row = this.database.prepare("SELECT * FROM users WHERE id = ?").get(userId) as Row | undefined;
    return row ? this.toUser(row) : null;
  }

  findUserByUsername(username: string): UserRecord | null {
    const row = this.database.prepare("SELECT * FROM users WHERE lower(username) = lower(?)").get(username) as Row | undefined;
    return row ? this.toUser(row) : null;
  }

  authenticate(username: string, password: string): UserRecord | null {
    const row = this.database.prepare("SELECT * FROM users WHERE lower(username) = lower(?)").get(username) as Row | undefined;
    if (!row || stringValue(row.status) !== "active" || !passwordMatches(password, stringValue(row.password_hash))) return null;
    return this.toUser(row);
  }

  listUsers(): UserRecord[] {
    return (this.database.prepare("SELECT * FROM users ORDER BY created_at DESC").all() as Row[]).map((row) => this.toUser(row));
  }

  setUserStatus(userId: string, status: UserStatus): UserRecord | null {
    this.database.prepare("UPDATE users SET status = ? WHERE id = ?").run(status, userId);
    return this.findUser(userId);
  }

  createRoom(name: string, description: string, ownerId: string): RoomRecord {
    const roomId = id("room");
    this.database
      .prepare("INSERT INTO rooms (id, name, description, owner_id, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)")
      .run(roomId, name, description, ownerId, now());
    this.joinRoom(roomId, ownerId);
    return this.getRoom(roomId)!;
  }

  getRoom(roomId: string): RoomRecord | null {
    const row = this.database
      .prepare(
        `SELECT r.*, COUNT(DISTINCT rm.user_id) AS member_count, COUNT(DISTINCT m.id) AS message_count
         FROM rooms r
         LEFT JOIN room_members rm ON rm.room_id = r.id
         LEFT JOIN messages m ON m.room_id = r.id
         WHERE r.id = ? GROUP BY r.id`,
      )
      .get(roomId) as Row | undefined;
    return row ? this.toRoom(row) : null;
  }

  listRooms(): RoomRecord[] {
    return (this.database
      .prepare(
        `SELECT r.*, COUNT(DISTINCT rm.user_id) AS member_count, COUNT(DISTINCT m.id) AS message_count
         FROM rooms r
         LEFT JOIN room_members rm ON rm.room_id = r.id
         LEFT JOIN messages m ON m.room_id = r.id
         GROUP BY r.id ORDER BY r.created_at DESC`,
      )
      .all() as Row[]).map((row) => this.toRoom(row));
  }

  setRoomStatus(roomId: string, status: RoomStatus): RoomRecord | null {
    this.database.prepare("UPDATE rooms SET status = ? WHERE id = ?").run(status, roomId);
    return this.getRoom(roomId);
  }

  joinRoom(roomId: string, userId: string): RoomRecord | null {
    this.database
      .prepare("INSERT OR IGNORE INTO room_members (room_id, user_id, joined_at) VALUES (?, ?, ?)")
      .run(roomId, userId, now());
    return this.getRoom(roomId);
  }

  isMember(roomId: string, userId: string): boolean {
    return Boolean(this.database.prepare("SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?").get(roomId, userId));
  }

  listMessages(roomId: string, limit = 80): MessageRecord[] {
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    return (this.database
      .prepare(
        `SELECT m.*, u.display_name FROM messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.room_id = ? ORDER BY m.created_at DESC LIMIT ?`,
      )
      .all(roomId, safeLimit) as Row[]).map((row) => this.toMessage(row)).reverse();
  }

  findMessage(messageId: string): MessageRecord | null {
    const row = this.database
      .prepare("SELECT m.*, u.display_name FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?")
      .get(messageId) as Row | undefined;
    return row ? this.toMessage(row) : null;
  }

  createMessage(roomId: string, userId: string, body: string): MessageRecord {
    const messageId = id("msg");
    this.database.prepare("INSERT INTO messages (id, room_id, user_id, body, status, created_at) VALUES (?, ?, ?, ?, 'visible', ?)").run(messageId, roomId, userId, body, now());
    return this.findMessage(messageId)!;
  }

  setMessageStatus(messageId: string, status: MessageStatus): MessageRecord | null {
    this.database.prepare("UPDATE messages SET status = ? WHERE id = ?").run(status, messageId);
    return this.findMessage(messageId);
  }

  createReport(messageId: string, roomId: string, reporterId: string, reason: string): ReportRecord {
    const reportId = id("rpt");
    this.database.prepare("INSERT INTO reports (id, message_id, room_id, reporter_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)").run(reportId, messageId, roomId, reporterId, reason, now());
    return this.findReport(reportId)!;
  }

  findReport(reportId: string): ReportRecord | null {
    const row = this.database
      .prepare(
        `SELECT r.*, reporter.display_name AS reporter_name, m.body AS message_body
         FROM reports r JOIN users reporter ON reporter.id = r.reporter_id
         JOIN messages m ON m.id = r.message_id WHERE r.id = ?`,
      )
      .get(reportId) as Row | undefined;
    return row ? this.toReport(row) : null;
  }

  listReports(status = "all"): ReportRecord[] {
    const query = status === "all"
      ? `SELECT r.*, reporter.display_name AS reporter_name, m.body AS message_body FROM reports r JOIN users reporter ON reporter.id = r.reporter_id JOIN messages m ON m.id = r.message_id ORDER BY r.created_at DESC`
      : `SELECT r.*, reporter.display_name AS reporter_name, m.body AS message_body FROM reports r JOIN users reporter ON reporter.id = r.reporter_id JOIN messages m ON m.id = r.message_id WHERE r.status = ? ORDER BY r.created_at DESC`;
    const rows = (status === "all"
      ? this.database.prepare(query).all()
      : this.database.prepare(query).all(status)) as Row[];
    return rows.map((row) => this.toReport(row));
  }

  reviewReport(reportId: string, status: ReportStatus, note: string): ReportRecord | null {
    this.database.prepare("UPDATE reports SET status = ?, note = ?, reviewed_at = ? WHERE id = ?").run(status, note, now(), reportId);
    return this.findReport(reportId);
  }

  overview(): OverviewRecord {
    const scalar = (sql: string): number => numberValue(this.database.prepare(sql).get()?.count);
    return {
      totalUsers: scalar("SELECT COUNT(*) AS count FROM users"),
      activeUsers: scalar("SELECT COUNT(*) AS count FROM users WHERE status = 'active'"),
      activeRooms: scalar("SELECT COUNT(*) AS count FROM rooms WHERE status = 'active'"),
      messagesToday: scalar("SELECT COUNT(*) AS count FROM messages WHERE created_at >= date('now')"),
      openReports: scalar("SELECT COUNT(*) AS count FROM reports WHERE status = 'open'"),
    };
  }

  claimsFor(user: UserRecord): AuthClaims {
    return { sub: user.id, username: user.username, role: user.role, exp: 0 };
  }

  private toUser(row: Row): UserRecord {
    return {
      id: stringValue(row.id), username: stringValue(row.username), displayName: stringValue(row.display_name),
      role: stringValue(row.role) === "admin" ? "admin" : "user",
      status: stringValue(row.status) === "suspended" ? "suspended" : "active",
      createdAt: stringValue(row.created_at),
    };
  }

  private toRoom(row: Row): RoomRecord {
    return {
      id: stringValue(row.id), name: stringValue(row.name), description: stringValue(row.description),
      jid: roomJid(stringValue(row.id), this.domain),
      status: (stringValue(row.status) || "active") as RoomStatus, ownerId: stringValue(row.owner_id),
      memberCount: numberValue(row.member_count), messageCount: numberValue(row.message_count), createdAt: stringValue(row.created_at),
    };
  }

  private toMessage(row: Row): MessageRecord {
    return {
      id: stringValue(row.id), roomId: stringValue(row.room_id), userId: stringValue(row.user_id),
      displayName: stringValue(row.display_name), body: stringValue(row.body),
      status: (stringValue(row.status) || "visible") as MessageStatus, createdAt: stringValue(row.created_at),
    };
  }

  private toReport(row: Row): ReportRecord {
    return {
      id: stringValue(row.id), messageId: stringValue(row.message_id), roomId: stringValue(row.room_id),
      reporterId: stringValue(row.reporter_id), reporterName: stringValue(row.reporter_name), messageBody: stringValue(row.message_body),
      reason: stringValue(row.reason), status: (stringValue(row.status) || "open") as ReportStatus, note: stringValue(row.note),
      createdAt: stringValue(row.created_at), reviewedAt: row.reviewed_at ? stringValue(row.reviewed_at) : null,
    };
  }
}
