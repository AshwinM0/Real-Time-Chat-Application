import { jest } from "@jest/globals";

const getUserFromToken = jest.fn();
jest.unstable_mockModule("../../utils/getUserFromToken.js", () => ({ default: getUserFromToken }));
const { default: protectRoute } = await import("../../middleware/protectRoute.js");

const fakeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

beforeEach(() => getUserFromToken.mockReset());

test("BU-7: a rejected token is a 401 with the reason, and the route never runs", async () => {
  getUserFromToken.mockResolvedValue({ error: "Invalid Token" });
  const req = { cookies: { jwt: "bad" } };
  const res = fakeRes();
  const next = jest.fn();

  await protectRoute(req, res, next);

  expect(getUserFromToken).toHaveBeenCalledWith("bad");
  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized - Invalid Token" });
  expect(next).not.toHaveBeenCalled();
});

test("BU-8: a valid token puts the user on the request and continues once", async () => {
  const user = { _id: "u1" };
  getUserFromToken.mockResolvedValue({ user });
  const req = { cookies: { jwt: "good" } };
  const res = fakeRes();
  const next = jest.fn();

  await protectRoute(req, res, next);

  expect(req.user).toBe(user);
  expect(next).toHaveBeenCalledTimes(1);
  expect(res.status).not.toHaveBeenCalled();
});

test("BU-9: an unexpected failure is a 500", async () => {
  getUserFromToken.mockRejectedValue(new Error("database down"));
  const res = fakeRes();
  const next = jest.fn();

  await protectRoute({ cookies: {} }, res, next);

  expect(res.status).toHaveBeenCalledWith(500);
  expect(next).not.toHaveBeenCalled();
});
