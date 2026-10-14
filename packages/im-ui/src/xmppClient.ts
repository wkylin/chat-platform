/// <reference path="./xmpp-client.d.ts" />

import {
  client as createXmppClient,
  xml,
  type XmppClient,
  type XmppCredentials,
  type XmppElement,
} from "@xmpp/client";
import type {
  ImChatMessage,
  ImXmppSession,
  XmppConnectionStatus,
} from "./types";

const MUC_NAMESPACE = "http://jabber.org/protocol/muc";
const META_NAMESPACE = "urn:match-chat:meta";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function bareJid(value: string): string {
  return text(value).split("/", 1)[0] ?? "";
}

function roomIdFromJid(value: string): string {
  const localPart = bareJid(value).split("@", 1)[0] ?? "";
  return localPart.startsWith("room-") ? localPart.slice(5) : localPart;
}

function resource(value: string): string {
  const parts = text(value).split("/");
  return parts.length > 1 ? parts.at(-1) ?? "" : "";
}

function createId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface XmppChatClientOptions {
  onStatus?: (status: XmppConnectionStatus) => void;
  onMessage?: (message: ImChatMessage) => void;
  onError?: (error: Error) => void;
  onReconnect?: () => void | Promise<void>;
}

/**
 * Framework-agnostic XMPP room client used by the reusable Vue panel.
 * History and moderation remain REST responsibilities of the host app.
 */
export class XmppChatClient {
  private client: XmppClient | null = null;
  private roomJid = "";
  private currentUserId = "";
  private nickname = "";
  private hasBeenOnline = false;
  private readonly options: XmppChatClientOptions;

  constructor(options: XmppChatClientOptions = {}) {
    this.options = options;
  }

  async connect(session: ImXmppSession): Promise<void> {
    await this.disconnect();
    this.currentUserId = session.jid.split("@", 1)[0] ?? "";
    this.nickname = `u-${this.currentUserId.slice(0, 10)}`;
    this.options.onStatus?.("connecting");

    const credentials: XmppCredentials = async (auth, mechanisms) => {
      const mechanism = mechanisms.includes("PLAIN") ? "PLAIN" : mechanisms[0];
      if (!mechanism) throw new Error("XMPP server did not offer authentication.");
      await auth(
        { username: session.xmppUsername, password: session.credential },
        mechanism,
      );
    };

    const client = createXmppClient({
      service: session.websocketUrl,
      domain: session.domain,
      lang: "en",
      resource: session.imSessionId,
      credentials,
    });
    this.client = client;
    client.on("stanza", (stanza) => this.handleStanza(stanza));
    client.on("online", () => {
      this.options.onStatus?.("online");
      if (this.roomJid) void this.joinCurrentRoom();
      if (this.hasBeenOnline) void this.options.onReconnect?.();
      this.hasBeenOnline = true;
    });
    client.on("offline", () => this.options.onStatus?.("offline"));
    client.on("error", (cause) => {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      this.options.onError?.(error);
      this.options.onStatus?.("error");
    });
    try {
      await client.start();
    } catch (cause) {
      this.options.onStatus?.("error");
      const error = cause instanceof Error ? cause : new Error(String(cause));
      this.options.onError?.(error);
      throw error;
    }
  }

  async setRoom(roomJid: string): Promise<void> {
    const nextRoomJid = bareJid(roomJid);
    const roomChanged = this.roomJid !== nextRoomJid;
    if (this.client?.status === "online" && this.roomJid && roomChanged) {
      await this.client.send(
        xml(
          "presence",
          { to: `${this.roomJid}/${this.nickname}`, type: "unavailable" },
        ),
      );
    }
    this.roomJid = nextRoomJid;
    if (this.client?.status === "online" && this.roomJid && roomChanged) await this.joinCurrentRoom();
  }

  async send(body: string): Promise<void> {
    const message = text(body);
    if (!message || !this.client || this.client.status !== "online") {
      throw new Error("Chat is not connected.");
    }
    if (!this.roomJid) throw new Error("No room selected.");
    await this.client.send(
      xml(
        "message",
        { to: this.roomJid, type: "groupchat", id: createId() },
        xml("body", {}, message),
      ),
    );
  }

  async disconnect(): Promise<void> {
    this.hasBeenOnline = false;
    const client = this.client;
    this.client = null;
    if (client) {
      try {
        await client.stop();
      } catch {
        // The socket may already be closed; cleanup remains idempotent.
      }
    }
    this.options.onStatus?.("offline");
  }

  private async joinCurrentRoom(): Promise<void> {
    if (!this.client || this.client.status !== "online" || !this.roomJid) return;
    await this.client.send(
      xml(
        "presence",
        { to: `${this.roomJid}/${this.nickname}` },
        xml("x", { xmlns: MUC_NAMESPACE }),
      ),
    );
  }

  private handleStanza(stanza: XmppElement): void {
    if (!stanza.is("message") || stanza.attrs.type !== "groupchat") return;
    const body = text(stanza.getChildText("body"));
    if (!body) return;
    const from = text(stanza.attrs.from);
    const meta = stanza.getChild("x", META_NAMESPACE);
    this.options.onMessage?.({
      id: text(stanza.attrs.id) || createId(),
      roomId: roomIdFromJid(from),
      userId: text(meta?.attrs.userId) || resource(from),
      displayName: text(meta?.attrs.displayName) || resource(from) || "Member",
      body,
      createdAt: text(meta?.attrs.createdAt) || new Date().toISOString(),
      status: "visible",
      mine: text(meta?.attrs.userId) === this.currentUserId,
    });
  }
}
