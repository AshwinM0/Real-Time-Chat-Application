import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";

// Native ESM: mock the module first, then import the code under test dynamically.
const select = jest.fn<(...args: any[]) => any>();
const findById = jest.fn(() => ({ select }));
jest.unstable_mockModule("../../models/userModel.ts", () => ({ default: { findById } }));
const isRevoked = jest.fn<(...args: any[]) => any>();
jest.unstable_mockModule("../../stores/revokedTokenStore.ts", () => ({ default: { isRevoked } }));
const { default: getUserFromToken } = await import("../../utils/getUserFromToken.ts");

// Real tokens carry an id (jwtid), which logout uses to revoke them, and expire.
const sign = (payload: object, secret = process.env.JWT_SECRET!, opts: jwt.SignOptions = { jwtid: "token-1" }) =>
  jwt.sign({ exp: Math.floor(Date.now() / 1000) + 60 * 60, ...payload }, secret, opts);

beforeEach(() => {
  findById.mockClear();
  select.mockReset();
  isRevoked.mockReset();
  isRevoked.mockResolvedValue(false);
});

test("BU-1: no token is rejected without touching the database", async () => {
  expect(await getUserFromToken(undefined)).toEqual({ error: "No Token Provided" });
  expect(findById).not.toHaveBeenCalled();
});

test("BU-2: a malformed token is invalid", async () => {
  expect(await getUserFromToken("not-a-jwt")).toEqual({ error: "Invalid Token" });
});

test("BU-3: a token signed with another secret is invalid", async () => {
  expect(await getUserFromToken(sign({ userId: "u1" }, "someone-elses-secret"))).toEqual({ error: "Invalid Token" });
});

test("BU-4: an expired token is invalid", async () => {
  const expired = sign({ userId: "u1", exp: Math.floor(Date.now() / 1000) - 60 });
  expect(await getUserFromToken(expired)).toEqual({ error: "Invalid Token" });
});

test("BU-5: a valid token for a user who no longer exists", async () => {
  select.mockResolvedValue(null);
  expect(await getUserFromToken(sign({ userId: "u1" }))).toEqual({ error: "User not found" });
  expect(findById).toHaveBeenCalledWith("u1");
});

test("BU-6: a valid token for an existing user returns them, without the password", async () => {
  const user = { _id: "u1", username: "ann" };
  select.mockResolvedValue(user);
  expect(await getUserFromToken(sign({ userId: "u1" }))).toEqual({ user, jti: "token-1" });
  expect(select).toHaveBeenCalledWith("-password");
});

test("BU-11: a token without an id, from before logout could revoke tokens, is invalid", async () => {
  expect(await getUserFromToken(sign({ userId: "u1" }, process.env.JWT_SECRET, {}))).toEqual({ error: "Invalid Token" });
  expect(findById).not.toHaveBeenCalled();
});

test("BU-12: a revoked token is refused, even though it's otherwise valid", async () => {
  select.mockResolvedValue({ _id: "u1", username: "ann" });
  isRevoked.mockResolvedValue(true);
  expect(await getUserFromToken(sign({ userId: "u1" }))).toEqual({ error: "Token revoked" });
  expect(isRevoked).toHaveBeenCalledWith("token-1");
});

test("BU-25: a token without an expiry or a user id, which this server never signs, is invalid", async () => {
  // Signed with the right secret and an id, but missing a claim every login token has.
  const noExpiry = jwt.sign({ userId: "u1" }, process.env.JWT_SECRET!, { jwtid: "token-1" });
  expect(await getUserFromToken(noExpiry)).toEqual({ error: "Invalid Token" });
  expect(await getUserFromToken(sign({ user: "u1" }))).toEqual({ error: "Invalid Token" });
  expect(findById).not.toHaveBeenCalled();
});
