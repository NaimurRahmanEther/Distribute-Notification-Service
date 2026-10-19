const { z } = require("zod");
const { ECDH } = require("node:crypto");
const validate = require("../../../middleware/validate");
const { isAllowedEndpoint } = require("../../../config/push");

function validPublicKey(value) {
  try {
    const key = Buffer.from(value, "base64url");
    return key.length === 65 && key[0] === 4 && ECDH.convertKey(key, "prime256v1").length === 65;
  } catch {
    return false;
  }
}

const subscriptionSchema = z.object({
  endpoint: z.string().max(2048).refine(isAllowedEndpoint, "Unsupported push endpoint"),
  expirationTime: z.number().nonnegative().nullable().optional(),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}=?$/).refine(validPublicKey, "Invalid push public key"),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}(==)?$/),
  }).strict(),
}).strict();

module.exports = {
  validateCreate: validate(subscriptionSchema),
  validateId: validate(z.object({ id: z.string().uuid() }).strict(), "params"),
};
