import { neon } from "@neondatabase/serverless";
import {
  createId,
  passwordHash,
  passwordMatches,
  roomJid,
  type ChatDatabase,
  type MessageRecord,
  type MessageStatus,
  type OverviewRecord,
  type ReportRecord,
  type ReportStatus,
  type RoomRecord,
  type RoomStatus,
  type UserRecord,
  type UserStatus,
} from "./db.js";

type Row = Record<string, unknown>;

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value instanceof Date ? value.toISOString() : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number(value) || 0;
}

function now(): string {
  return new Date().toISOString();
}

function isTransientConnectionError(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause);
  return /fetch failed|socket|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(message);
}

/** Neon-backed persistent database. Queries use Neon HTTP to avoid holding
 * database sockets open between Vercel Function invocations. */
export class PostgresChatDatabase implements ChatDatabase {
  private readonly sql: ReturnType<typeof neon>;
  private readonly domain: string;
  private readonly ready: Promise<void>;

  constructor(connectionString: string, domain: string, adminUsername: string, adminPassword: string, syncAdminPassword = false) {
    this.sql = neon(connectionString);
    this.domain = domain;
    this.ready = this.initializeWithRetry(adminUsername, adminPassword, syncAdminPassword);
  }

  private rawQuery<T extends Row = Row>(query: string, params: unknown[] = []): Promise<T[]> {
    return this.sql.query(query, params) as Promise<T[]>;
  }

  private async query<T extends Row = Row>(query: string, params: unknown[] = []): Promise<T[]> {
    await this.ready;
    return this.rawQuery<T>(query, params);
  }

  ensureReady(): Promise<void> {
    return this.ready;
  }

  private async initializeWithRetry(adminUsername: string, adminPassword: string, syncAdminPassword: boolean): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.initialize(adminUsername, adminPassword, syncAdminPassword);
        return;
      } catch (cause) {
        if (!isTransientConnectionError(cause) || attempt >= 2) throw cause;
        console.warn(`[postgres] temporary connection failure during startup; retry ${attempt + 1}/2`);
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      }
    }
  }

  private async initialize(adminUsername: string, adminPassword: string, syncAdminPassword: boolean): Promise<void> {
    await this.rawQuery(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL
      )
    `);
    await this.rawQuery(`CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      owner_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    )`);
    await Promise.all([
      this.rawQuery(`CREATE TABLE IF NOT EXISTS room_members (
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TEXT NOT NULL,
        PRIMARY KEY (room_id, user_id)
      )`),
      this.rawQuery(`CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id),
        body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'visible',
        created_at TEXT NOT NULL
      )`),
    ]);
    await this.rawQuery(`CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      reporter_id TEXT NOT NULL REFERENCES users(id),
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      reviewed_at TEXT
    )`);
    await Promise.all([
      this.rawQuery("CREATE INDEX IF NOT EXISTS messages_room_created ON messages(room_id, created_at)"),
      this.rawQuery("CREATE INDEX IF NOT EXISTS reports_status_created ON reports(status, created_at)"),
      this.rawQuery("CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique ON users (lower(username))"),
    ]);

    const adminPasswordHash = passwordHash(adminPassword);
    if (syncAdminPassword) {
      // Production environment variables are the source of truth for the seeded admin password.
      await this.rawQuery(
        "UPDATE users SET password_hash = $1 WHERE lower(username) = lower($2) AND role = 'admin'",
        [adminPasswordHash, adminUsername],
      );
    }
    await this.rawQuery(
      `INSERT INTO users (id, username, display_name, password_hash, role, status, created_at)
       VALUES ($1, $2, 'Control Room', $3, 'admin', 'active', $4)
       ON CONFLICT DO NOTHING`,
      [createId("usr"), adminUsername, adminPasswordHash, now()],
    );
    const [admin] = await this.rawQuery<{ id: string }>("SELECT id FROM users WHERE lower(username) = lower($1)", [adminUsername]);
    await this.rawQuery(
      `INSERT INTO users (id, username, display_name, password_hash, role, status, created_at)
       VALUES ($1, 'guest', 'Guest Member', $2, 'user', 'active', $3)
       ON CONFLICT DO NOTHING`,
      [createId("usr"), passwordHash("guest123!"), now()],
    );
    const [guest] = await this.rawQuery<{ id: string }>("SELECT id FROM users WHERE lower(username) = 'guest'");
    if (!admin || !guest) throw new Error("Could not initialize default accounts in PostgreSQL.");

    await this.rawQuery(
      `INSERT INTO rooms (id, name, description, owner_id, status, created_at)
       VALUES ('room_default', 'Signal Commons', 'A focused room for live conversation.', $1, 'active', $2)
       ON CONFLICT (id) DO NOTHING`,
      [admin.id, now()],
    );
    await this.rawQuery(
      `INSERT INTO room_members (room_id, user_id, joined_at)
       VALUES ('room_default', $1, $2), ('room_default', $3, $2)
       ON CONFLICT (room_id, user_id) DO NOTHING`,
      [admin.id, now(), guest.id],
    );
  }

  close(): void {}

  async createUser(username: string, password: string, displayName: string, role: "user" | "admin" = "user"): Promise<UserRecord> {
    const userId = createId("usr");
    await this.query(
      `INSERT INTO users (id, username, display_name, password_hash, role, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'active', $6)`,
      [userId, username, displayName || username, passwordHash(password), role, now()],
    );
    const user = await this.findUser(userId);
    if (!user) throw new Error("Could not create user.");
    return user;
  }

  async findUser(userId: string): Promise<UserRecord | null> {
    const [row] = await this.query("SELECT * FROM users WHERE id = $1", [userId]);
    return row ? this.toUser(row) : null;
  }

  async findUserByUsername(username: string): Promise<UserRecord | null> {
    const [row] = await this.query("SELECT * FROM users WHERE lower(username) = lower($1)", [username]);
    return row ? this.toUser(row) : null;
  }

  async authenticate(username: string, password: string): Promise<UserRecord | null> {
    const [row] = await this.query("SELECT * FROM users WHERE lower(username) = lower($1)", [username]);
    if (!row || stringValue(row.status) !== "active" || !passwordMatches(password, stringValue(row.password_hash))) return null;
    return this.toUser(row);
  }

  async listUsers(): Promise<UserRecord[]> {
    return (await this.query("SELECT * FROM users ORDER BY created_at DESC")).map((row) => this.toUser(row));
  }

  async setUserStatus(userId: string, status: UserStatus): Promise<UserRecord | null> {
    await this.query("UPDATE users SET status = $1 WHERE id = $2", [status, userId]);
    return this.findUser(userId);
  }

  async createRoom(name: string, description: string, ownerId: string): Promise<RoomRecord> {
    const roomId = createId("room");
    await this.query(
      "INSERT INTO rooms (id, name, description, owner_id, status, created_at) VALUES ($1, $2, $3, $4, 'active', $5)",
      [roomId, name, description, ownerId, now()],
    );
    await this.joinRoom(roomId, ownerId);
    const room = await this.getRoom(roomId);
    if (!room) throw new Error("Could not create room.");
    return room;
  }

  async getRoom(roomId: string): Promise<RoomRecord | null> {
    const [row] = await this.query(
      `SELECT r.*, COUNT(DISTINCT rm.user_id)::int AS member_count, COUNT(DISTINCT m.id)::int AS message_count
       FROM rooms r
       LEFT JOIN room_members rm ON rm.room_id = r.id
       LEFT JOIN messages m ON m.room_id = r.id
       WHERE r.id = $1 GROUP BY r.id`,
      [roomId],
    );
    return row ? this.toRoom(row) : null;
  }

  async listRooms(): Promise<RoomRecord[]> {
    return (await this.query(
      `SELECT r.*, COUNT(DISTINCT rm.user_id)::int AS member_count, COUNT(DISTINCT m.id)::int AS message_count
       FROM rooms r
       LEFT JOIN room_members rm ON rm.room_id = r.id
       LEFT JOIN messages m ON m.room_id = r.id
       GROUP BY r.id ORDER BY r.created_at DESC`,
    )).map((row) => this.toRoom(row));
  }

  async setRoomStatus(roomId: string, status: RoomStatus): Promise<RoomRecord | null> {
    await this.query("UPDATE rooms SET status = $1 WHERE id = $2", [status, roomId]);
    return this.getRoom(roomId);
  }

  async joinRoom(roomId: string, userId: string): Promise<RoomRecord | null> {
    await this.query(
      "INSERT INTO room_members (room_id, user_id, joined_at) VALUES ($1, $2, $3) ON CONFLICT (room_id, user_id) DO NOTHING",
      [roomId, userId, now()],
    );
    return this.getRoom(roomId);
  }

  async isMember(roomId: string, userId: string): Promise<boolean> {
    const [row] = await this.query("SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2", [roomId, userId]);
    return Boolean(row);
  }

  async listMessages(roomId: string, limit = 80): Promise<MessageRecord[]> {
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const rows = await this.query(
      `SELECT m.*, u.display_name FROM messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.room_id = $1 ORDER BY m.created_at DESC LIMIT $2`,
      [roomId, safeLimit],
    );
    return rows.map((row) => this.toMessage(row)).reverse();
  }

  async findMessage(messageId: string): Promise<MessageRecord | null> {
    const [row] = await this.query(
      "SELECT m.*, u.display_name FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = $1",
      [messageId],
    );
    return row ? this.toMessage(row) : null;
  }

  async createMessage(roomId: string, userId: string, body: string): Promise<MessageRecord> {
    const messageId = createId("msg");
    await this.query(
      "INSERT INTO messages (id, room_id, user_id, body, status, created_at) VALUES ($1, $2, $3, $4, 'visible', $5)",
      [messageId, roomId, userId, body, now()],
    );
    const message = await this.findMessage(messageId);
    if (!message) throw new Error("Could not save message.");
    return message;
  }

  async setMessageStatus(messageId: string, status: MessageStatus): Promise<MessageRecord | null> {
    await this.query("UPDATE messages SET status = $1 WHERE id = $2", [status, messageId]);
    return this.findMessage(messageId);
  }

  async createReport(messageId: string, roomId: string, reporterId: string, reason: string): Promise<ReportRecord> {
    const reportId = createId("rpt");
    await this.query(
      `INSERT INTO reports (id, message_id, room_id, reporter_id, reason, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'open', $6)`,
      [reportId, messageId, roomId, reporterId, reason, now()],
    );
    const report = await this.findReport(reportId);
    if (!report) throw new Error("Could not create report.");
    return report;
  }

  async findReport(reportId: string): Promise<ReportRecord | null> {
    const [row] = await this.query(
      `SELECT r.*, reporter.display_name AS reporter_name, m.body AS message_body
       FROM reports r JOIN users reporter ON reporter.id = r.reporter_id
       JOIN messages m ON m.id = r.message_id WHERE r.id = $1`,
      [reportId],
    );
    return row ? this.toReport(row) : null;
  }

  async listReports(status = "all"): Promise<ReportRecord[]> {
    const rows = status === "all"
      ? await this.query(
        `SELECT r.*, reporter.display_name AS reporter_name, m.body AS message_body
         FROM reports r JOIN users reporter ON reporter.id = r.reporter_id
         JOIN messages m ON m.id = r.message_id ORDER BY r.created_at DESC`,
      )
      : await this.query(
        `SELECT r.*, reporter.display_name AS reporter_name, m.body AS message_body
         FROM reports r JOIN users reporter ON reporter.id = r.reporter_id
         JOIN messages m ON m.id = r.message_id WHERE r.status = $1 ORDER BY r.created_at DESC`,
        [status],
      );
    return rows.map((row) => this.toReport(row));
  }

  async reviewReport(reportId: string, status: ReportStatus, note: string): Promise<ReportRecord | null> {
    await this.query("UPDATE reports SET status = $1, note = $2, reviewed_at = $3 WHERE id = $4", [status, note, now(), reportId]);
    return this.findReport(reportId);
  }

  async overview(): Promise<OverviewRecord> {
    const dayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
    const [users, activeUsers, activeRooms, messagesToday, openReports] = await Promise.all([
      this.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM users"),
      this.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM users WHERE status = 'active'"),
      this.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM rooms WHERE status = 'active'"),
      this.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM messages WHERE created_at >= $1", [dayStart]),
      this.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM reports WHERE status = 'open'"),
    ]);
    return {
      totalUsers: numberValue(users[0]?.count),
      activeUsers: numberValue(activeUsers[0]?.count),
      activeRooms: numberValue(activeRooms[0]?.count),
      messagesToday: numberValue(messagesToday[0]?.count),
      openReports: numberValue(openReports[0]?.count),
    };
  }

  private toUser(row: Row): UserRecord {
    return {
      id: stringValue(row.id),
      username: stringValue(row.username),
      displayName: stringValue(row.display_name),
      role: stringValue(row.role) === "admin" ? "admin" : "user",
      status: stringValue(row.status) === "suspended" ? "suspended" : "active",
      createdAt: stringValue(row.created_at),
    };
  }

  private toRoom(row: Row): RoomRecord {
    const roomId = stringValue(row.id);
    return {
      id: roomId,
      name: stringValue(row.name),
      description: stringValue(row.description),
      jid: roomJid(roomId, this.domain),
      status: (stringValue(row.status) || "active") as RoomStatus,
      ownerId: stringValue(row.owner_id),
      memberCount: numberValue(row.member_count),
      messageCount: numberValue(row.message_count),
      createdAt: stringValue(row.created_at),
    };
  }

  private toMessage(row: Row): MessageRecord {
    return {
      id: stringValue(row.id),
      roomId: stringValue(row.room_id),
      userId: stringValue(row.user_id),
      displayName: stringValue(row.display_name),
      body: stringValue(row.body),
      status: (stringValue(row.status) || "visible") as MessageStatus,
      createdAt: stringValue(row.created_at),
    };
  }

  private toReport(row: Row): ReportRecord {
    return {
      id: stringValue(row.id),
      messageId: stringValue(row.message_id),
      roomId: stringValue(row.room_id),
      reporterId: stringValue(row.reporter_id),
      reporterName: stringValue(row.reporter_name),
      messageBody: stringValue(row.message_body),
      reason: stringValue(row.reason),
      status: (stringValue(row.status) || "open") as ReportStatus,
      note: stringValue(row.note),
      createdAt: stringValue(row.created_at),
      reviewedAt: row.reviewed_at ? stringValue(row.reviewed_at) : null,
    };
  }
}
