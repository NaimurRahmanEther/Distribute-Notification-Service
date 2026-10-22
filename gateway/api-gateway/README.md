# Gateway access checks

## Request flow

Client -> Nginx load balancer -> one API gateway -> access middleware -> business service

The edge balances requests across two Nginx gateways. Before forwarding, each gateway calls the internal Express gateway-access process through Nginx auth_request. The middleware checks route policy, centralized Redis IP limits, then the access token through Auth's internal session-introspection endpoint. Auth owns JWT validation, session revocation and current roles. Invalid requests never reach the business route.

Notification verifies a short-lived HMAC-signed gateway identity bound to the HTTP method, original URI and access token. It retains ownership, admin and business validation. Public clients cannot supply this identity: both proxy layers replace or strip the header. Compose requires it; direct Node development can explicitly set REQUIRE_GATEWAY_IDENTITY=false to use the original Auth introspection flow.

## Route policies and default limits

All counted requests share a global 100 requests / 60 seconds IP budget, plus their route-family budget:

| Route | Authentication | Route IP budget |
| --- | --- | --- |
| POST auth/register | Public | 5 / 15 minutes |
| POST auth/login | Public | 10 / 15 minutes |
| POST auth/refresh, auth/logout | Refresh cookie validated by Auth | 30 / 60 seconds per family |
| notifications, notification-deliveries, notification-preferences, push-subscriptions | Bearer token | 100 / 60 seconds per family |
| admin/dead-letters, admin/operations | Bearer token + current admin role | 100 / 60 seconds per family |
| /socket.io/ handshake | Socket cookie or Bearer token | 100 / 60 seconds |

Policies live in access/src/config/routes.js. Unknown routes return 404. Known-route OPTIONS and health checks are exempt. Established socket messages do not consume this HTTP quota. Existing Auth service limits remain in effect.

All gateway-access replicas share gateway-redis. Atomic Redis counters use gateway:rate:ip: and gateway:rate:route: prefixes. IPv6 addresses are grouped by /56; NAT users share a public-IP quota. The edge replaces client-supplied forwarding headers. Neither the gateway nor access service should publish a host port. Gateway Redis is separate from Auth Redis and Notification/BullMQ Redis; it is a single instance, not a high-availability cluster.

## Configuration

Root .env.example lists GATEWAY_RATE_LIMIT_MAX/WINDOW_MS, GATEWAY_ROUTE_RATE_LIMIT_MAX/WINDOW_MS, GATEWAY_LOGIN_RATE_LIMIT_MAX, GATEWAY_REGISTER_RATE_LIMIT_MAX, GATEWAY_AUTH_RATE_LIMIT_WINDOW_MS and GATEWAY_SESSION_RATE_LIMIT_MAX. Set a separate GATEWAY_IDENTITY_SECRET of at least 32 characters, shared only by gateway-access and Notification. INTERNAL_SERVICE_TOKEN authenticates the access middleware to Auth. AUTH_SERVICE_TIMEOUT_MS bounds introspection. JWT signing keys remain in Auth.

For an existing local stack, recreate services and remove the renamed gateway-rate-limit container:

```powershell
docker compose up -d --build --remove-orphans --scale api-gateway=2 --scale gateway-access=2
```

Only the edge publishes a port. Local access-process settings are in access/.env.example. Keep machine clocks synchronized: signed identities expire after ten seconds.

## Browser sockets

Login and refresh also set an HttpOnly notificationSocketAccess cookie scoped to /socket.io/. Use credentials: include on these HTTP calls and send the current accessToken in Socket.IO auth.token. The cookie lets the gateway authenticate the HTTP upgrade before Socket.IO receives its auth packet. The packet token must match the cookie token; after refresh, reconnect with the latest token. Native clients can send Authorization: Bearer instead. Logout clears both cookies, and existing socket session rechecks enforce revocation. Cookie SameSite/Secure and allowed-origin settings still apply.

## Failure behavior

- 401: missing, expired or revoked token.
- 403: authenticated user lacks the required admin role.
- 429: IP budget exhausted; Retry-After gives seconds to wait.
- 503: Redis, access middleware or Auth validation unavailable; traffic is not forwarded unchecked.

Gateway-RateLimit-Limit/Remaining/Reset describe the route limiter on allowed requests, or the limiter that rejected the request. Reset is seconds remaining. Readiness checks Redis/Auth and Notification; liveness remains available during dependency failure. Allowed origins receive rejection CORS headers when the middleware is reachable. Business responses retain their original status/body; Nginx upstream failures may still be HTML.

## Reading order

1. ../../infra/nginx/nginx.conf: edge balancing and trusted headers.
2. nginx.conf: access subrequest, rejection mapping, forwarding and WebSocket upgrade.
3. access/src/config/routes.js: public/protected/admin policies.
4. access/src/app.js: middleware order.
5. access/src/middleware/rate-limit.middleware.js: shared Redis counters.
6. access/src/middleware/auth.middleware.js and access/src/clients/auth.client.js: session validation and signed identity.
7. ../../services/notification-service/src/clients/gateway-identity.js: identity verification before business code.

## Verification

On October 22, 2026 a disposable Compose stack with two gateways, two access replicas and two Notification APIs passed registration/login, token rejection, validation order, ownership, admin policy, real outbox/worker live delivery, socket cookie/Bearer authentication, refresh/logout revocation, preflight exemptions and private-route isolation. Thirty concurrent requests against a route budget of twenty produced twenty authentication checks and ten 429 responses. IP spoofing did not bypass the quota. Direct service bypass, signature tampering and URI tampering were rejected. Redis and Auth outages returned 503. Browser-cookie transport was simulated with a Socket.IO Node client; no frontend browser automation was run. Temporary fixtures and infrastructure were removed after testing.

References: [Nginx auth_request](https://nginx.org/en/docs/http/ngx_http_auth_request_module.html), [Socket.IO browser header limitations](https://socket.io/docs/v4/client-options/#extraheaders).
