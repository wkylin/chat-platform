# Match Chat IM Platform

独立的 XMPP over WebSocket 群聊平台，包含：

- `apps/client`：用户端与可复用 IM Chat Panel 演示
- `apps/admin`：运营数据、房间管理、消息审核
- `apps/server`：Node REST API、SQLite 持久化、XMPP WebSocket 网关
- `packages/im-ui`：可嵌入的 Vue IM 组件与 XMPP 客户端封装

## 启动

服务端使用 Node 内置 `node:sqlite`，请使用 Node.js 22.5+ 与 pnpm。

```bash
pnpm install
pnpm dev:server
pnpm dev:client
pnpm dev:admin
```

- 用户端：<http://localhost:5178>
- 管理端：<http://localhost:5179>
- API / XMPP：<http://localhost:8787>
- XMPP WebSocket：`ws://localhost:8787/xmpp-websocket`

首次启动会创建一个演示管理员：

```text
用户名：admin
密码：admin123!
```

生产环境请通过 `IM_JWT_SECRET`、`IM_ADMIN_PASSWORD` 和 `IM_XMPP_WS_URL` 覆盖默认值，并使用 `wss://`。

## 协议边界

REST 负责账号、房间、历史消息、举报与审核；实时消息走 XMPP over WebSocket。当前 Node 网关实现了本项目所需的最小 XMPP client-to-server 与 MUC 群聊流程，客户端使用标准 `@xmpp/client`，未来可以将网关替换成 Prosody 或 ejabberd，而不需要改用户端组件协议。

实现遵循 [XMPP WebSocket framing（RFC 7395）](https://xmpp.org/rfcs/rfc7395.html)，客户端 API 参考 [`@xmpp/client`](https://github.com/xmppjs/xmpp.js/blob/main/packages/client/README.md)。
