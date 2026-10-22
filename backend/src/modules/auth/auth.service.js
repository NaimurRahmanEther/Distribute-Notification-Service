const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const env = require("../../config/env");
const authRepository = require("./auth.repository");
const AppError = require("../../shared/errors/AppError");
const { z } = require("zod");

const sessionClaimsSchema = z.object({
  sub: z.string().regex(/^[1-9]\d*$/).max(19),
  sid: z.string().uuid(),
});

function hasValidSessionClaims(payload) {
  const result = sessionClaimsSchema.safeParse(payload);
  return result.success && BigInt(result.data.sub) <= 9223372036854775807n;
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createAccessToken(user, sessionId) {
  return jwt.sign(
    {
      sub: String(user.id),
      sid: sessionId,
      role: user.user_role,
      type: "access",
    },
    env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: env.ACCESS_TOKEN_EXPIRES_IN,
      algorithm: "HS256",
    }
  );
}

function createRefreshToken(user, sessionId) {
  return jwt.sign(
    {
      sub: String(user.id),
      sid: sessionId,
      type: "refresh",
    },
    env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
      algorithm: "HS256",
    }
  );
}

async function register({ fullName, email, password }) {
  const normalizedEmail = email.trim().toLowerCase();

  // The database UNIQUE constraint handles duplicate and concurrent registrations.
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    return await authRepository.createUser({
      fullName,
      email: normalizedEmail,
      passwordHash,
    });
  } catch (error) {

    if (error.code === "23505") {
      throw new AppError("Email is already registered", 409);
    }

    throw error;
  }
}

async function login({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await authRepository.findByEmail(normalizedEmail);

  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  const passwordMatches = await bcrypt.compare(
    password,
    user.password_hash
  );

  if (!passwordMatches) {
    throw new AppError("Invalid email or password", 401);
  }

  const sessionId = crypto.randomUUID();

  const accessToken = createAccessToken(user, sessionId);
  const refreshToken = createRefreshToken(user, sessionId);

  const decodedRefreshToken = jwt.decode(refreshToken);

  const refreshExpiresAt = new Date(decodedRefreshToken.exp * 1000);
  const refreshTokenHash = hashRefreshToken(refreshToken);

  await authRepository.replaceActiveSession({
    sessionId,
    userId: user.id,
    refreshTokenHash,
    expiresAt: refreshExpiresAt,
  });

  const safeUser = {
    id: user.id,
    email: user.email,
    user_role: user.user_role,
    created_at: user.created_at,
  };

  return {
    user: safeUser,
    accessToken,
    refreshToken,
    refreshExpiresAt,
  };
}

async function refresh(refreshToken) {
  let payload;

  try {
    payload = jwt.verify(
      refreshToken,
      env.REFRESH_TOKEN_SECRET,
      { algorithms: ["HS256"] }
    );
  } catch {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  if (payload.type !== "refresh" || !hasValidSessionClaims(payload)) {
    throw new AppError("Invalid refresh token", 401);
  }

  const session = await authRepository.findActiveSession({
    sessionId: payload.sid,
    userId: payload.sub,
  });

  if (!session || session.refresh_token_hash !== hashRefreshToken(refreshToken)) {
    throw new AppError("Session is expired or revoked", 401);
  }

  const user = await authRepository.findById(payload.sub);

  if (!user) {
    throw new AppError("Invalid refresh token", 401);
  }

  return { accessToken: createAccessToken(user, session.id) };
}

async function logout(refreshToken) {

  if (!refreshToken) {
    return;
  }

  let payload;

  try {
    payload = jwt.verify(
      refreshToken,
      env.REFRESH_TOKEN_SECRET,
      { algorithms: ["HS256"] }
    );
  } catch {

    return;
  }

  if (
    payload.type !== "refresh" ||
    !hasValidSessionClaims(payload)
  ) {
    return;
  }

  const tokenHash = hashRefreshToken(refreshToken);

  await authRepository.revokeSession({
    sessionId: payload.sid,
    userId: payload.sub,
    refreshTokenHash: tokenHash,
  });
}

async function authenticateAccessToken(accessToken) {
  let payload;

  try {
    payload = jwt.verify(
      accessToken,
      env.ACCESS_TOKEN_SECRET,
      { algorithms: ["HS256"] }
    );
  } catch {
    throw new AppError("Invalid or expired access token", 401);
  }

  if (
    payload.type !== "access" ||
    !hasValidSessionClaims(payload)
  ) {
    throw new AppError("Invalid access token", 401);
  }

  const session = await authRepository.findActiveSession({
    sessionId: payload.sid,
    userId: payload.sub,
  });

  if (!session) {
    throw new AppError("Session is expired or revoked", 401);
  }

  const user = await getUserById(payload.sub);
  return { ...user, sessionId: payload.sid };
}

async function getUserById(userId) {
  const user = await authRepository.findById(userId);
  if (!user) {
    throw new AppError("User not found", 404);
  }
  return { userId: String(user.id), role: user.user_role, email: user.email };
}

module.exports = {
  getUserById,
  register,
  login,
  refresh,
  logout,
  authenticateAccessToken,
};
