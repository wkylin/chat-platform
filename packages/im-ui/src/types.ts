export interface ImChatMessage {
  id: string;
  roomId: string;
  userId: string;
  displayName: string;
  body: string;
  createdAt: string;
  status: "visible" | "removed";
  mine?: boolean;
}

export interface ImRoom {
  id: string;
  name: string;
  description: string;
  jid: string;
  status: "active" | "paused" | "closed";
  memberCount: number;
  messageCount: number;
  createdAt: string;
  ownerId: string;
}

export interface ImUser {
  id: string;
  username: string;
  displayName: string;
  role: "user" | "admin";
  status: "active" | "suspended";
  createdAt: string;
}

export type XmppConnectionStatus =
  | "idle"
  | "connecting"
  | "online"
  | "offline"
  | "error";

export interface ImXmppSession {
  imSessionId: string;
  xmppUsername: string;
  credential: string;
  jid: string;
  websocketUrl: string;
  domain: string;
  expiresInSeconds: number;
}

export interface ImChatPanelLabels {
  liveThread: string;
  people: string;
  emptyTitle: string;
  emptyDescription: string;
  report: string;
  removedMessage: string;
  unavailablePlaceholder: string;
  composerPlaceholder: string;
  sendHint: string;
  send: string;
  status: Record<XmppConnectionStatus, string>;
}
