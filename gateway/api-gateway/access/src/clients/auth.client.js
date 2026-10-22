const { z } = require("zod");
const env = require("../config/env");

const userSchema = z.object({
  userId: z.string().regex(/^[1-9]\d{0,18}$/).refine(value => BigInt(value) <= 9223372036854775807n),
  role: z.string().max(50),
  email: z.string().email().max(255),
  sessionId: z.string().uuid(),
});

async function introspect(token, requestId) {
  const response = await fetch(`${env.AUTH_SERVICE_URL}/internal/v1/auth/introspect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Service-Token": env.INTERNAL_SERVICE_TOKEN, "X-Request-Id": requestId || "" },
    body: JSON.stringify({ token }),
    signal: AbortSignal.timeout(env.AUTH_SERVICE_TIMEOUT_MS),
    redirect: "error",
  });
  if ([400, 401, 404].includes(response.status)) {
    return null;
  }
  if (!response.ok) {
    throw new Error("AUTH_UNAVAILABLE");
  }
  const result = await response.json();
  return userSchema.parse(result.user);
}

async function ready() {
  const response = await fetch(`${env.AUTH_SERVICE_URL}/health/ready`, {
    signal: AbortSignal.timeout(env.AUTH_SERVICE_TIMEOUT_MS),
    redirect: "error",
  });
  return response.ok;
}

module.exports = { introspect, ready };
