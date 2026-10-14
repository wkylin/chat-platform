# Deploy the server to Vercel

This package exposes its REST API and XMPP WebSocket gateway through one Vercel Node.js function. In the Vercel project, set the Root Directory to `apps/server`, use Node.js 22, and keep Fluid Compute enabled for WebSocket support.

Set these production environment variables in Vercel before the first production deployment:

- `IM_JWT_SECRET`: a unique random signing secret.
- `IM_ADMIN_PASSWORD`: a strong password for the seeded API administrator.
- `IM_ADMIN_USERNAME`: optional; defaults to `admin`.
- `IM_XMPP_DOMAIN`: optional; defaults to the Vercel production hostname.
- `IM_XMPP_WS_URL`: optional; defaults to `wss://<production-host>/api/xmpp-websocket`.

The Vercel function stores SQLite under `/tmp`. That filesystem and the in-memory XMPP session and presence registries are local to an instance and can reset or diverge when Vercel restarts or scales the function. This is suitable for a disposable preview only. A persistent deployment needs a shared database and Redis-backed session/presence/pub-sub before enabling the real client/admin frontends against this API.

WebSocket connections close when the function reaches its configured maximum duration (300 seconds here). The XMPP client reconnects automatically.
