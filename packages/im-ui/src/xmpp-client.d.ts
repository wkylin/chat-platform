declare module "@xmpp/client" {
  export interface XmppElement {
    name: string;
    attrs: Record<string, string | undefined>;
    text(): string;
    toString(): string;
    is(name: string, namespace?: string): boolean;
    getChild(name: string, namespace?: string): XmppElement | undefined;
    getChildText(name: string, namespace?: string): string | undefined;
    getChildren(name: string, namespace?: string): XmppElement[];
  }

  export interface XmppJid {
    local?: string;
    domain: string;
    resource?: string;
    bare(): XmppJid;
    toString(displayLocal?: boolean): string;
  }

  export type XmppAuthenticate = (
    credentials: { username: string; password: string },
    mechanism: string,
  ) => Promise<void>;

  export type XmppCredentials = (
    authenticate: XmppAuthenticate,
    mechanisms: string[],
    fast: unknown,
    entity: XmppClient,
  ) => Promise<void>;

  export interface XmppReconnect { stop(): void; }

  export interface XmppClient {
    readonly status: string;
    on(event: "online", listener: (address: XmppJid) => unknown): XmppClient;
    on(event: "stanza", listener: (stanza: XmppElement) => unknown): XmppClient;
    on(event: "error", listener: (error: unknown) => unknown): XmppClient;
    on(event: "offline", listener: (...args: unknown[]) => unknown): XmppClient;
    start(): Promise<void>;
    stop(): Promise<unknown>;
    send(element: XmppElement): Promise<void>;
  }

  export function client(options: {
    service: string;
    domain: string;
    lang?: string;
    resource?: string;
    credentials?: XmppCredentials;
  }): XmppClient;

  export function xml(
    name: string,
    attrs?: Record<string, string | undefined> | null,
    ...children: Array<XmppElement | string | null | undefined | Array<XmppElement | string>>
  ): XmppElement;
}
