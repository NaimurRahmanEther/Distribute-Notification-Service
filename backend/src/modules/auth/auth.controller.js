
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

// POST /api/v1/auth/register
async function register(req, res, next) {
  try {
    const user = await authService.register(req.body);

    return successResponse(res, {
      statusCode: 201,
      message: "Account created successfully",
      data: { user },
    });
  } catch (error) {
    return next(error);
  }
}

// POST /api/v1/auth/login
async function login(req, res, next) {
  try {
    const result = await authService.login(req.body);

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

    // Return the access token in the response body.
    // Do not return the refresh token in JSON.
    return successResponse(res, {
      statusCode: 200,
      message: "Login successful",
      data: {
        user: result.user,
        accessToken: result.accessToken,
        tokenType: "Bearer",
      },
    });
  } catch (error) {
    return next(error);
  }
}

// POST /api/v1/auth/refresh
async function refresh(req, res, next) {
  try {
    const refreshToken = req.cookies?.[env.REFRESH_COOKIE_NAME];
    const result = await authService.refresh(refreshToken);

    return successResponse(res, {
      statusCode: 200,
      message: "Token refreshed successfully",
      data: {
        accessToken: result.accessToken,
        tokenType: "Bearer",
      },
    });
  } catch (error) {
    return next(error);
  }
}

// POST /api/v1/auth/logout
async function logout(req, res, next) {
  try {
    const refreshToken =
      req.cookies?.[env.REFRESH_COOKIE_NAME];

    await authService.logout(refreshToken);

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
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
};
