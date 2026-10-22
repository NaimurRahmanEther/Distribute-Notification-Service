const { z } = require("zod");

const handshakeSchema = z.object({
  token: z.string().min(1).max(8192),
});

const activitySchema = z.object({ active: z.boolean() }).strict();

const eventSchema = z.object({
  userId: z.string().regex(/^[1-9]\d{0,18}$/),
  event: z.enum(["notification:new", "notification:read", "notifications:read-all", "notification:deleted"]),
  notificationId: z.string().uuid().optional(),
}).strict().refine((value) => value.event === "notifications:read-all" || Boolean(value.notificationId));

module.exports = { handshakeSchema, activitySchema, eventSchema };
