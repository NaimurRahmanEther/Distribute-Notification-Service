const auth = require("../auth/auth.service");
const repository = require("../auth/auth.repository");
const AppError = require("../../shared/errors/AppError");

async function findUser(id) {
  const user = await repository.findById(id);
  if (!user) {
    throw new AppError("User not found", 404);
  }
  return { userId: String(user.id), role: user.user_role, email: user.email };
}

async function introspect(token) {
  const session = await auth.authenticateAccessToken(token);
  const user = await findUser(session.userId);
  return { ...user, sessionId: session.sessionId };
}

module.exports = { findUser, introspect };
