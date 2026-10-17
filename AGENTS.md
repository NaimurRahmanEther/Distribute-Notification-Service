# Coding pattern

- Use CommonJS (`require` and `module.exports`), two-space indentation, double quotes, and semicolons in JavaScript.
- Follow route -> validation -> controller -> service -> repository. Authentication runs before protected route validation.
- Keep request schemas in each module's validation file and use `middleware/validate.js`. Controllers read `req.validated.body`, `req.validated.query`, and `req.validated.params`.
- Wrap async controllers with `asyncHandler`. Use named functions for services, repositories, and middleware.
- Keep SQL in repositories and business decisions in services. Use parameterized queries and pass the same client through a transaction.
- Validate external inputs at their boundary. Do not repeat route validation in services, except for internal entry points that bypass routes. Keep authentication, ownership, database constraints, and queue-boundary checks.
- Prefer direct async/await code, descriptive variables, and explicit blocks. Split complicated expressions into named steps. Avoid catch blocks that only rethrow, except when needed for rollback or cleanup.
- Add helpers only for repeated logic or a clear, separate responsibility. Do not add classes, frameworks, generic service layers, or dependencies just to organize simple code.
- Preserve existing endpoints, response shapes, notification policies, retry behavior, and user changes unless the task requires changing them.
- Run checks appropriate to the change. Use temporary tests when needed and remove them afterward; do not retain test files or folders.
