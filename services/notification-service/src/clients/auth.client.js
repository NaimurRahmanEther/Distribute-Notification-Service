const { z } = require("zod");
const env = require("../config/env");
const AppError = require("../shared/errors/AppError");
const recipients = require("../modules/notification/recipients/notification-recipient.repository");
const { context } = require("../shared/utils/logger");
const { randomUUID } = require("node:crypto");

const userSchema = z.object({
  userId: z.string().regex(/^[1-9]\d{0,18}$/),
  role: z.string().max(50),
  email: z.string().email().max(255),
  sessionId: z.string().uuid().optional(),
});

async function request(path, body, signal) {
  let response;
  let result;
  try {
    const timeout = AbortSignal.timeout(env.AUTH_SERVICE_TIMEOUT_MS);
    response = await fetch(`${env.AUTH_SERVICE_URL}${path}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "X-Service-Token": env.INTERNAL_SERVICE_TOKEN, "X-Request-Id": context.getStore()?.requestId || randomUUID() },
      body: body ? JSON.stringify(body) : undefined,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      redirect: "error",
    });
    result = await response.json();
  } catch {
    throw new AppError("Authentication service unavailable", 503);
  }
  if (response.status === 404) {
    throw new AppError("User not found", 404);
  }
  if ([400, 401].includes(response.status) && body) {
    throw new AppError("Invalid or expired session", 401);
  }
  const parsed = userSchema.safeParse(result.user);
  if (!response.ok || !parsed.success) {
    throw new AppError("Authentication service unavailable", 503);
  }
  return parsed.data;
}

async function authenticateAccessToken(token) {
  const user = await request("/internal/v1/auth/introspect", { token });
  if (!user.sessionId) {
    throw new AppError("Authentication service unavailable", 503);
  }
  await recipients.sync(user);
  return user;
}

async function getRecipient(userId, signal) {
  return request(`/internal/v1/users/${encodeURIComponent(userId)}`, null, signal);
}

async function ready() {
  try {
    const response = await fetch(`${env.AUTH_SERVICE_URL}/health/ready`, {
      signal: AbortSignal.timeout(env.AUTH_SERVICE_TIMEOUT_MS),
      redirect: "error",
    });
    return response.ok;
  } catch {
    return false;
  }
}

module.exports = { authenticateAccessToken, getRecipient, ready };
