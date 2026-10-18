import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import generateTokenAndSetCookie from "../../utils/generateToken.js";

test("BU-10: sets an httpOnly jwt cookie for 15 days that decodes to the user id", () => {
  const res = { cookie: jest.fn() };

  generateTokenAndSetCookie("user-123", res);

  expect(res.cookie).toHaveBeenCalledTimes(1);
  const [name, token, options] = res.cookie.mock.calls[0];
  expect(name).toBe("jwt");
  expect(options).toMatchObject({ httpOnly: true, maxAge: 15 * 24 * 60 * 60 * 1000 });
  expect(jwt.verify(token, process.env.JWT_SECRET).userId).toBe("user-123");
});
