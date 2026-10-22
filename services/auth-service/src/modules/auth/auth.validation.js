const { z } = require("zod");
const validate = require("../../middleware/validate");

// bcrypt limits passwords by UTF-8 bytes, not JavaScript character count.
const passwordSchema = z.string().min(8).max(72).refine(
  (value) => Buffer.byteLength(value, "utf8") <= 72,
  "Password must not exceed 72 bytes"
);

const registerSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  password: passwordSchema,
});

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: passwordSchema,
});

module.exports = {
  validateRegister: validate(registerSchema),
  validateLogin: validate(loginSchema),
};
