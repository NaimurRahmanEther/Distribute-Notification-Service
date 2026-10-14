jest.mock("../modules/auth/auth.service", () => ({
  authenticateAccessToken: jest.fn(),
}));

const express = require("express");
const request = require("supertest");
const authService = require("../modules/auth/auth.service");
const authenticate = require("./auth.middleware");
const errorHandler = require("./errorHandler");
const AppError = require("../shared/errors/AppError");

const app = express();
app.get("/protected", authenticate, (req, res) => res.json(req.user));
app.use(errorHandler);

beforeEach(() => jest.resetAllMocks());

test.each([undefined, "Basic credentials", "Bearer", "Bearer one two"])(
  "rejects missing or malformed credentials: %s",
  async (authorization) => {
    const pending = request(app).get("/protected");
    if (authorization !== undefined) pending.set("Authorization", authorization);
    const response = await pending;
    expect(response.status).toBe(401);
    expect(authService.authenticateAccessToken).not.toHaveBeenCalled();
  }
);

test("passes the authenticated user to the protected handler", async () => {
  const user = { userId: "1", sessionId: "session-id", role: "user" };
  authService.authenticateAccessToken.mockResolvedValue(user);
  const response = await request(app).get("/protected")
    .set("Authorization", "bearer access-token");
  expect(response.status).toBe(200);
  expect(response.body).toEqual(user);
  expect(authService.authenticateAccessToken).toHaveBeenCalledWith("access-token");
});

test("blocks rejected tokens and forwards the service error", async () => {
  authService.authenticateAccessToken.mockRejectedValue(
    new AppError("Session is expired or revoked", 401)
  );
  const response = await request(app).get("/protected")
    .set("Authorization", "Bearer rejected-token");
  expect(response.status).toBe(401);
  expect(response.body.message).toBe("Session is expired or revoked");
});

test("forwards unexpected service failures to the error handler", async () => {
  authService.authenticateAccessToken.mockRejectedValue(new Error("Database unavailable"));
  const response = await request(app).get("/protected")
    .set("Authorization", "Bearer access-token");
  expect(response.status).toBe(500);
  expect(response.body.message).toBe("Internal server error");
});
