const { z } = require("zod");
const AppError = require("../../shared/errors/AppError");

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

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return next(
        new AppError(
          "Validation failed",
          400,
          result.error.flatten().fieldErrors
        )
      );
    }

    req.body = result.data;
    next();
  };
}

module.exports = {
  validateRegister: validateBody(registerSchema),
  validateLogin: validateBody(loginSchema),
};
