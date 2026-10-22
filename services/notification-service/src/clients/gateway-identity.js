const { createHmac, createHash, timingSafeEqual } = require("node:crypto");
const { z } = require("zod");
const env = require("../config/env");
const AppError = require("../shared/errors/AppError");

const identitySchema = z.object({
  user: z.object({
    userId: z.string().regex(/^[1-9]\d{0,18}$/).refine(value => BigInt(value) <= 9223372036854775807n),
    role: z.string().max(50),
    email: z.string().email().max(255),
    sessionId: z.string().uuid(),
  }),
  method: z.string(),
  uriHash: z.string(),
  tokenHash: z.string(),
  expiresAt: z.number().int(),
});

function readGatewayIdentity(req, token) {
  const header = req.headers["x-gateway-identity"];
  if (!header && !env.REQUIRE_GATEWAY_IDENTITY) {
    // Direct Node development keeps its original Auth introspection flow.
    return null;
  }
  try {
    if (typeof header !== "string" || header.length > 8192 || !env.GATEWAY_IDENTITY_SECRET) {
      throw new Error("Missing gateway identity");
    }
    const [payload, signature, extra] = header.split(".");
    if (!payload || !signature || extra !== undefined) {
      throw new Error("Invalid gateway identity");
    }
    const expected = createHmac("sha256", env.GATEWAY_IDENTITY_SECRET).update(payload).digest();
    const supplied = Buffer.from(signature, "base64url");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new Error("Invalid gateway signature");
    }
    const identity = identitySchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const uriHash = createHash("sha256").update(req.originalUrl || req.url).digest("hex");
    if (identity.expiresAt <= Date.now() || identity.expiresAt > Date.now() + 15000 ||
        identity.method !== req.method || identity.uriHash !== uriHash || identity.tokenHash !== tokenHash) {
      throw new Error("Gateway identity does not match request");
    }
    return identity.user;
  } catch {
    throw new AppError("A verified gateway identity is required", 401);
  }
}

module.exports = { readGatewayIdentity };
