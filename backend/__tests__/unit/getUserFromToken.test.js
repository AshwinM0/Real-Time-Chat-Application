import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";

// Native ESM: mock the module first, then import the code under test dynamically.
const select = jest.fn();
const findById = jest.fn(() => ({ select }));
jest.unstable_mockModule("../../models/userModel.js", () => ({ default: { findById } }));
const { default: getUserFromToken } = await import("../../utils/getUserFromToken.js");

const sign = (payload, secret = process.env.JWT_SECRET, opts = {}) => jwt.sign(payload, secret, opts);

beforeEach(() => {
  findById.mockClear();
  select.mockReset();
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
  expect(await getUserFromToken(sign({ userId: "u1" }))).toEqual({ user });
  expect(select).toHaveBeenCalledWith("-password");
});
