# Weilchat

Anonymous, text-only random chat. The UI uses a bright, minimal visual identity with generous white space, oversized typography, soft lavender surfaces, and restrained purple accents.

## Stack

- Static HTML/CSS/JavaScript frontend
- Node.js 22 Vercel Functions + Socket.IO (WebSocket transport only)
- Upstash Redis via ioredis for cross-instance matchmaking, rate limits, and reports
- Socket.IO Redis adapter for cross-instance events
- Playwright browser tests and GitHub Actions CI

## Local development

Requires Node.js 22+.

    npm ci
    npm run dev

Local development uses process-local matchmaking and report storage when REDIS_URL is omitted. To exercise Redis locally, set REDIS_URL to an Upstash TCP/TLS connection string.

The Socket.IO function is mounted at the exact route /api/socket-io/socket.io. The browser and server share this path. Redis is required in production so matches work across function instances.

## Deployment

1. Import this repository into Vercel as the weilchat project.
2. Set REDIS_URL as a Sensitive environment variable for Production, Preview, and Development. Use the Upstash Redis TCP/TLS connection string, not the REST URL/token pair.
3. Set MODERATION_TOKEN as a Sensitive environment variable. It protects the moderation dashboard at /moderation.html.
4. Deploy. The production site is https://weilchat.vercel.app.

The project pins Node.js to 22.x. Function connections can still be closed when the platform reaches its configured maximum duration; the client reconnects and matchmaking state lives in Redis.

## Moderation

- Users can report an active conversation using one of the predefined reasons.
- Reports are stored in Redis for up to 30 days. Chat message content is not stored.
- Open reports can be reviewed at /moderation.html using the MODERATION_TOKEN bearer token.
- Moderators can mark a report as resolved or dismissed.
- The dashboard keeps the token in the current tab only; it is not written to local storage.

## Rate limits and validation

- Connection attempts: 40 per client IP per minute
- Match searches: 20 per client IP per minute
- Messages: 45 per client IP per minute, plus a per-socket minimum interval
- Reports: 3 per client IP per 10 minutes
- Match, message, and report payloads are strictly validated. Client IPs are HMAC-hashed before being used in rate-limit keys; the keys expire automatically.

## Tests

    npm test
    npm run test:e2e
    npm run test:redis
    npm run test:production

- npm test runs unit tests and local Socket.IO integration tests.
- npm run test:e2e runs a two-browser flow covering matching, messages, reporting, and leaving.
- npm run test:redis runs the cross-instance Redis test when REDIS_TEST_URL is configured. It uses a separate weilchat:test:* key namespace; do not point it at production credentials with unrestricted access.
- npm run test:e2e also verifies reconnect while waiting, graceful recovery after an interrupted chat, and mobile viewport/layout behaviour.
- npm run test:production runs the live WebSocket smoke test against WEILCHAT_PRODUCTION_URL. It requires WEILCHAT_MODERATION_TOKEN so its temporary report can be checked and dismissed automatically. Run only after a production deployment is ready.
- GitHub Actions runs unit tests and browser tests on pushes and pull requests to main. The Redis integration job runs when the repository secret REDIS_TEST_URL is configured.

## Safety boundaries

- 18+ is self-attestation only; no identity or age verification is performed.
- Gender is self-selected and is not verified.
- No profiles, usernames, images, audio, or video.
- Messages are relayed live and are not stored as chat history.
