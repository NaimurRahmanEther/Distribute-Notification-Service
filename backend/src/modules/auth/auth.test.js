jest.mock("../../config/db", () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}));

jest.mock("../../config/env", () => ({
  ACCESS_TOKEN_SECRET: "test-access-secret",
  REFRESH_TOKEN_SECRET: "test-refresh-secret",
  ACCESS_TOKEN_EXPIRES_IN: "15m",
  REFRESH_TOKEN_EXPIRES_IN: "7d",
  REFRESH_COOKIE_NAME: "refreshToken",
  REFRESH_COOKIE_SECURE: false,
  REFRESH_COOKIE_SAME_SITE: "strict",
  REFRESH_COOKIE_PATH: "/api/v1/auth",
}));

const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const { pool } = require("../../config/db");
const env = require("../../config/env");
const authService = require("./auth.service");
const app = require("../../app");

let user;

beforeEach(async () => {
  jest.resetAllMocks();
  user = {
    id: "1",
    full_name: "Test User",
    email: "test@example.com",
    password_hash: await bcrypt.hash("password123", 4),
    user_role: "user",
  };
});

test("registration validates and persists the full name", async () => {
  pool.query.mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: user.id, full_name: user.full_name }] });

  const response = await request(app).post("/api/v1/auth/register").send({
    fullName: " Test User ", email: "TEST@example.com", password: "password123",
  });

  expect(response.status).toBe(201);
  const values = pool.query.mock.calls[1][1];
  expect(values.slice(0, 2)).toEqual(["Test User", "test@example.com"]);
  expect(await bcrypt.compare("password123", values[2])).toBe(true);

  const invalid = await request(app).post("/api/v1/auth/register").send({
    email: user.email, password: "password123",
  });
  expect(invalid.status).toBe(400);
});

test("login persists the JWT session ID and logout revokes that session via its cookie", async () => {
  const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
  pool.connect.mockResolvedValue(client);
  pool.query.mockResolvedValueOnce({ rows: [user] });
  client.query.mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [user] })
    .mockResolvedValueOnce({ rows: [] })
    .mockImplementationOnce(async (sql, values) => ({ rows: [{ id: values[0] }] }));

  const response = await request(app).post("/api/v1/auth/login").send({
    email: user.email, password: "password123",
  });
  expect(response.status).toBe(200);
  const cookie = response.headers["set-cookie"][0].split(";")[0];
  const refreshToken = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1));
  const payload = jwt.verify(refreshToken, env.REFRESH_TOKEN_SECRET);
  const insert = client.query.mock.calls.find(([sql]) => sql.includes("INSERT INTO user_sessions"));
  expect(insert[1][0]).toBe(payload.sid);
  expect(insert[1][1]).toBe(user.id);

  pool.query.mockResolvedValueOnce({ rows: [{ id: payload.sid }] });
  const logout = await request(app).post("/api/v1/auth/logout").set("Cookie", cookie);
  expect(logout.status).toBe(200);
  expect(pool.query.mock.calls.at(-1)[1]).toEqual([
    payload.sid, user.id, crypto.createHash("sha256").update(refreshToken).digest("hex"),
  ]);
});

test("refresh issues an access token only for the stored token and active session", async () => {
  const sessionId = crypto.randomUUID();
  const refreshToken = jwt.sign({ sub: user.id, sid: sessionId, type: "refresh" },
    env.REFRESH_TOKEN_SECRET, { expiresIn: "7d" });
  const session = {
    id: sessionId,
    refresh_token_hash: crypto.createHash("sha256").update(refreshToken).digest("hex"),
  };
  pool.query.mockResolvedValueOnce({ rows: [session] })
    .mockResolvedValueOnce({ rows: [user] });
  const response = await request(app).post("/api/v1/auth/refresh")
    .set("Cookie", `refreshToken=${refreshToken}`);
  expect(response.status).toBe(200);
  const payload = jwt.verify(response.body.data.accessToken, env.ACCESS_TOKEN_SECRET);
  expect(payload).toMatchObject({ sub: user.id, sid: sessionId, role: "user", type: "access" });

  pool.query.mockResolvedValueOnce({ rows: [] });
  await expect(authService.refresh(refreshToken)).rejects.toMatchObject({ statusCode: 401 });
  pool.query.mockResolvedValueOnce({ rows: [{ ...session, refresh_token_hash: "wrong" }] });
  await expect(authService.refresh(refreshToken)).rejects.toMatchObject({ statusCode: 401 });
});

test("refresh rejects missing, invalid, expired, and wrong-type tokens", async () => {
  const claims = { sub: user.id, sid: crypto.randomUUID(), type: "refresh" };
  const tokens = [undefined, "invalid",
    jwt.sign(claims, env.REFRESH_TOKEN_SECRET, { expiresIn: -1 }),
    jwt.sign({ ...claims, type: "access" }, env.REFRESH_TOKEN_SECRET),
  ];
  for (const token of tokens) {
    await expect(authService.refresh(token)).rejects.toMatchObject({ statusCode: 401 });
  }
  expect(pool.query).not.toHaveBeenCalled();
});
