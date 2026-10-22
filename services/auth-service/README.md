# Auth service

Owns users, password hashes, JWT signing, sessions and authentication rate limiting. Its PostgreSQL and Redis are separate from notification storage.

Read the [root setup](../../README.md) first. Within this directory:

```powershell
npm ci
npm run migrate:up
npm run dev
```

Copy `.env.example` only when `.env` is absent. Configure its own `DATABASE_URL`, Redis, JWT secrets and the same `INTERNAL_SERVICE_TOKEN` used by notification processes. Direct development listens on port 3001.

Reading order:

1. `src/server.js` and `src/app.js`: startup, shutdown and route mounting.
2. `src/modules/auth/auth.routes.js`, validation, controller, service, repository: public authentication flow.
3. `src/modules/internal/`: service-token-protected session introspection and recipient lookup.
4. `src/database/migrations/`: owned users/session tables.
5. `src/modules/health/` and `src/middleware/`: health, logging and boundary checks.

The gateway exposes `/api/v1/auth/*`. Internal `/internal/v1/auth/introspect` and `/internal/v1/users/:id` are only for trusted services; they never return password hashes or refresh tokens. Introspection checks the stored session and current user role, so logout and permission changes apply to notification requests too.

Login/refresh also set the HttpOnly `notificationSocketAccess` cookie scoped to `/socket.io/`; logout clears it. The gateway uses Auth session introspection before forwarding protected requests. See [gateway access checks](../../gateway/api-gateway/README.md).
