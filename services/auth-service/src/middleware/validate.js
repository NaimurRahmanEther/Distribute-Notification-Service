const AppError = require("../shared/errors/AppError");

function validate(schema, source = "body") {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new AppError("Validation failed", 400, result.error.flatten().fieldErrors));
    }

    req.validated ??= {};
    req.validated[source] = result.data;
    next();
  };
}

module.exports = validate;
