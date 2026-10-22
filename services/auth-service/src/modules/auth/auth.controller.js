const asyncHandler = require("../../shared/utils/async-handler");

const authService = require("./auth.service");
const env = require("../../config/env");
const {
  successResponse,
} = require("../../shared/utils/api-response");

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.REFRESH_COOKIE_SECURE,
    sameSite: env.REFRESH_COOKIE_SAME_SITE,
    path: env.REFRESH_COOKIE_PATH,
  };
}

function socketCookieOptions() {
  return { ...refreshCookieOptions(), path: "/socket.io/" };
}

// POST /api/v1/auth/register
const register = asyncHandler(async (req, res) => {
  const user = await authService.register(req.validated.body);

  return successResponse(res, {
    statusCode: 201,
    message: "Account created successfully",
    data: { user },
  });
});

// POST /api/v1/auth/login
const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.validated.body);
  // Gateway authentication happens before Socket.IO's auth packet arrives.
  // The session cookie is HttpOnly and sent only to the WebSocket path.
  res.cookie(env.GATEWAY_SOCKET_COOKIE_NAME, result.accessToken, socketCookieOptions());

  const maxAge = Math.max(
    0,
    new Date(result.refreshExpiresAt).getTime() - Date.now()
  );

  // Store the refresh token in an HttpOnly cookie.
  res.cookie(
    env.REFRESH_COOKIE_NAME,
    result.refreshToken,
    {
      ...refreshCookieOptions(),
      maxAge,
    }
  );

  return successResponse(res, {
    statusCode: 200,
    message: "Login successful",
    data: {
      user: result.user,
      accessToken: result.accessToken,
      tokenType: "Bearer",
    },
  });
});

// POST /api/v1/auth/refresh
const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.[env.REFRESH_COOKIE_NAME];
  const result = await authService.refresh(refreshToken);
  res.cookie(env.GATEWAY_SOCKET_COOKIE_NAME, result.accessToken, socketCookieOptions());

  return successResponse(res, {
    statusCode: 200,
    message: "Token refreshed successfully",
    data: {
      accessToken: result.accessToken,
      tokenType: "Bearer",
    },
  });
});

// POST /api/v1/auth/logout
const logout = asyncHandler(async (req, res) => {
  const refreshToken =
    req.cookies?.[env.REFRESH_COOKIE_NAME];

  await authService.logout(refreshToken);
  res.clearCookie(env.GATEWAY_SOCKET_COOKIE_NAME, socketCookieOptions());

  // Remove the cookie using the same path and options.
  res.clearCookie(
    env.REFRESH_COOKIE_NAME,
    refreshCookieOptions()
  );

  return successResponse(res, {
    statusCode: 200,
    message: "Logout successful",
    data: null,
  });
});

module.exports = {
  register,
  login,
  refresh,
  logout,
};
