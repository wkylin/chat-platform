# Deploy the server to Vercel

The server exposes its REST API and XMPP WebSocket gateway from one Node.js function. In the Vercel project, set **Root Directory** to `apps/server`, use Node.js 22.x, and make sure Fluid Compute is enabled.

## Persistent storage

The Vercel runtime requires both a Neon PostgreSQL database and an Upstash Redis database. In the Vercel project directory, provision and connect the free resources from the Marketplace:

Use the free tiers in Singapore (`sin1`) so the database, Redis, and server function are colocated. The Upstash resource is configured not to auto-upgrade:

```sh
vercel integration add neon --plan free_v3 --environment production --metadata region=sin1 --metadata auth=false
vercel integration add upstash/upstash-kv --plan free --environment production --metadata primaryRegion=sin1 --metadata autoUpgrade=false
```

The integrations add these variables to the linked Vercel project:

- Neon: `DATABASE_URL`
- Upstash: `KV_REST_API_URL` and `KV_REST_API_TOKEN` (also accepts `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`)

Postgres stores accounts, rooms, room memberships, messages, and reports. Redis stores short-lived XMPP login credentials and relays messages and presence between function instances. The schema and initial demo accounts are created automatically on first start. Local development continues to use SQLite.

The free plans are suitable for a small demo and have provider usage limits. Neon currently offers a $0 plan; Upstash Free currently includes 256 MB and 500,000 commands per month. With auto-upgrade disabled, Upstash can stop accepting writes at its free limit instead of switching to a paid plan.

## Server environment variables

Add these to the Vercel project (Production, and Preview if preview deployments should run the API):

| Variable | Required | Purpose |
| --- | --- | --- |
| `IM_JWT_SECRET` | Yes | Unique random key for signing API login tokens. |
| `IM_ADMIN_PASSWORD` | Yes | Password for the seeded administrator. In production, a new deployment applies this value to the existing seeded administrator account. |
| `IM_ADMIN_USERNAME` | No | Administrator name; defaults to `admin`. |
| `IM_XMPP_DOMAIN` | No | XMPP domain; defaults to the Vercel production host. |
| `IM_XMPP_WS_URL` | No | WebSocket URL; defaults to `wss://<production-host>/api/xmpp-websocket`. |
| `IM_SESSION_LIFETIME_SECONDS` | No | Redis XMPP credential lifetime; defaults to 604800 seconds (7 days). |

Generate a signing secret locally with `openssl rand -base64 32`. Add secret values through the Vercel CLI prompt or project settings; do not commit them or paste them into chat. Create a new deployment after changing environment variables.

## Deploy

After linking the Vercel project and adding the resources and secrets:

```sh
vercel deploy --prod
```

Check `https://<deployment-host>/api/health` for the REST health response. The WebSocket endpoint is `wss://<deployment-host>/api/xmpp-websocket`.

Vercel WebSocket connections are pinned to one function instance, but a new connection may reach a different instance; Redis provides the shared session and pub/sub state. Vercel closes a connection when the function reaches its maximum duration (300 seconds on Hobby), and the XMPP client reconnects automatically. After reconnecting, it reloads room history through the REST API.
