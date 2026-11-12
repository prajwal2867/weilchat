# Weilchat

Anonymous, text-only random chat. The UI borrows Buckshot Browser's restrained terminal layout while using Segoe UI.

## Stack
- Static HTML/CSS/JavaScript frontend
- Node.js Vercel Function + Socket.IO (WebSocket transport only)
- Upstash Redis via ioredis for cross-instance matchmaking state
- Socket.IO Redis adapter for cross-instance events

## Local development
Requires Node.js 22+ and a Redis database.

```bash
npm install
REDIS_URL="rediss://default:<password>@<host>:6379" npm run dev
```

The Vercel function is served at `/api/socket-io`; Socket.IO clients use `/api/socket-io/socket.io` and WebSocket transport only.

## Deployment
1. Import this repository into Vercel as the `weilchat` project.
2. Add `REDIS_URL` as an encrypted environment variable for Production, Preview and Development. Use the Upstash Redis TCP/TLS connection string (not the REST URL/token pair).
3. Deploy. The default project URL should be `https://weilchat.vercel.app` if that Vercel slug is available.
4. Function connections can be closed at the platform's maximum duration; the client reconnects and matchmaking state lives in Redis.

## MVP safety boundaries
- 18+ self-attestation gate; no identity or age verification is performed.
- No profile, username, image, audio or video.
- Messages are relayed live and are not stored as chat history.
- Basic message length and rate limits, report submission, and leave/next controls.
- Gender is self-selected and is not verified.
