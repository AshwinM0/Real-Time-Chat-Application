import { jest } from "@jest/globals";
import jwt, { type JwtPayload } from "jsonwebtoken";
import generateTokenAndSetCookie from "../../utils/generateToken.ts";

test("BU-10: sets an httpOnly jwt cookie for 15 days that decodes to the user id", () => {
  const res: any = { cookie: jest.fn() };

  generateTokenAndSetCookie("user-123", res);

  expect(res.cookie).toHaveBeenCalledTimes(1);
  const [name, token, options] = res.cookie.mock.calls[0];
  expect(name).toBe("jwt");
  expect(options).toMatchObject({ httpOnly: true, maxAge: 15 * 24 * 60 * 60 * 1000 });
  expect((jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload).userId).toBe("user-123");
});

test("BU-13: every login gets its own token id, so logout can revoke one without the others", () => {
  const res: any = { cookie: jest.fn() };

  generateTokenAndSetCookie("user-123", res);
  generateTokenAndSetCookie("user-123", res);

  const [first, second] = res.cookie.mock.calls.map(([, token]: any) => (jwt.decode(token) as JwtPayload).jti);
  expect(first).toEqual(expect.any(String));
  expect(second).not.toBe(first);
});
