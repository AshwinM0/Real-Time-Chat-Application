import request, { type Response } from "supertest";
import bcrypt from "bcryptjs";
import User from "../../models/userModel.ts";
import { startTestServer, type TestServer } from "../../test/testServer.ts";
import { signUp } from "../../test/factories.ts";

let server: TestServer;
beforeAll(async () => { server = await startTestServer("auth_test"); });
afterEach(() => server.reset());
afterAll(() => server.close());

const validSignup = (overrides: Record<string, any> = {}) => ({
  fullName: "Ann Lee", username: `ann_${Date.now()}`, password: "secret123", confirmPassword: "secret123", gender: "female",
  ...overrides,
});

const jwtCookie = (res: Response) => (res.get("Set-Cookie") ?? []).find((c) => c.startsWith("jwt="));

describe("signup", () => {
  test("BI-1: creates the user, returns the profile without the password, and sets an HttpOnly jwt cookie", async () => {
    const body = validSignup();
    const res = await request(server.url).post("/api/auth/signup").send(body).expect(201);

    expect(Object.keys(res.body).sort()).toEqual(["_id", "fullName", "profilePic", "username"]);
    expect(res.body).toMatchObject({ fullName: "Ann Lee", username: body.username });
    expect(jwtCookie(res)).toMatch(/HttpOnly/i);

    const stored = await User.findById(res.body._id);
    expect(stored!.password).not.toBe("secret123");
    expect(await bcrypt.compare("secret123", stored!.password)).toBe(true);
  });

  test("BI-2: mismatched passwords are a 400", async () => {
    await request(server.url).post("/api/auth/signup")
      .send(validSignup({ confirmPassword: "different" })).expect(400);
  });

  test("BI-3: a taken username is a 400", async () => {
    const body = validSignup();
    await request(server.url).post("/api/auth/signup").send(body).expect(201);
    const res = await request(server.url).post("/api/auth/signup").send(body).expect(400);
    expect(res.body.error).toBe("Username already taken");
  });

  // The body is checked before anything else runs (backend/validation.ts). Without
  // that, Mongoose or bcrypt rejected bad input later, and the catch made it a 500.
  describe("BI-4: invalid input is a 400 that says what's wrong", () => {
    test("missing full name", async () => {
      const res = await request(server.url).post("/api/auth/signup").send(validSignup({ fullName: undefined })).expect(400);
      expect(res.body).toEqual({ error: "Full name is required" });
    });
    test("missing password", async () => {
      const res = await request(server.url).post("/api/auth/signup")
        .send(validSignup({ password: undefined, confirmPassword: undefined })).expect(400);
      expect(res.body).toEqual({ error: "Password is required" });
    });
    test("invalid gender", async () => {
      const res = await request(server.url).post("/api/auth/signup").send(validSignup({ gender: "other" })).expect(400);
      expect(res.body).toEqual({ error: "Gender must be male or female" });
    });
  });

  test("BI-69: a password under 6 characters, which only the browser used to refuse, is a 400, and no user is saved", async () => {
    const body = validSignup({ password: "abc", confirmPassword: "abc" });

    const res = await request(server.url).post("/api/auth/signup").send(body).expect(400);

    expect(res.body).toEqual({ error: "Password must be at least 6 characters" });
    expect(await User.exists({ username: body.username })).toBeNull();
  });
});

describe("login and logout", () => {
  test("BI-5: the right password logs in and sets a jwt cookie", async () => {
    const user = await signUp(server, "bob");
    const res = await request(server.url).post("/api/auth/login")
      .send({ username: user.username, password: "secret123" }).expect(200);

    expect(res.body._id).toBe(user.id);
    expect(jwtCookie(res)).toBeDefined();
  });

  test("BI-6: an unknown username or a wrong password is a 400 with the matching message", async () => {
    const user = await signUp(server, "bob");

    const unknown = await request(server.url).post("/api/auth/login")
      .send({ username: "nobody", password: "secret123" }).expect(400);
    expect(unknown.body.error).toBe("Invalid username");

    const wrong = await request(server.url).post("/api/auth/login")
      .send({ username: user.username, password: "wrong-password" }).expect(400);
    expect(wrong.body.error).toBe("Incorrect password");
  });

  test("BI-70: a username that isn't text, such as a query operator, is a 400 and never reaches MongoDB", async () => {
    await signUp(server, "bob");

    // { "$ne": null } matches every user, so without the check this logged in as
    // whoever MongoDB returned first, given that user's password.
    const operator = await request(server.url).post("/api/auth/login")
      .send({ username: { $ne: null }, password: "secret123" }).expect(400);
    expect(operator.body).toEqual({ error: "Username must be text" });
    expect(jwtCookie(operator)).toBeUndefined();

    // Without a password, bcrypt used to throw: a 500.
    const noPassword = await request(server.url).post("/api/auth/login").send({ username: "bob" }).expect(400);
    expect(noPassword.body).toEqual({ error: "Password is required" });
  });

  test("BI-7: logout clears the jwt cookie", async () => {
    const res = await request(server.url).post("/api/auth/logout").expect(200);
    expect(jwtCookie(res)).toMatch(/^jwt=;/);
    expect(jwtCookie(res)).toMatch(/Max-Age=0/i);
  });

  test("BI-32: after logout, a copy of the old cookie is refused", async () => {
    const ann = await signUp(server, "ann");
    await request(server.url).get("/api/users").set("Cookie", ann.cookie).expect(200);

    await request(server.url).post("/api/auth/logout").set("Cookie", ann.cookie).expect(200);
    // Logging out again with the same cookie is harmless.
    await request(server.url).post("/api/auth/logout").set("Cookie", ann.cookie).expect(200);

    const res = await request(server.url).get("/api/users").set("Cookie", ann.cookie).expect(401);
    expect(res.body.error).toBe("Unauthorized - Token revoked");
  });

  test("BI-33: logging out ends only that login, not the user's other ones", async () => {
    const ann = await signUp(server, "ann");
    const phoneLogin = await request(server.url).post("/api/auth/login")
      .send({ username: ann.username, password: "secret123" }).expect(200);
    const phoneCookie = jwtCookie(phoneLogin)!.split(";")[0]!;

    await request(server.url).post("/api/auth/logout").set("Cookie", ann.cookie).expect(200);

    await request(server.url).get("/api/users").set("Cookie", phoneCookie).expect(200);
  });
});

test("BI-64: a body that isn't valid JSON is a 400 with a JSON error, not an HTML page", async () => {
  const res = await request(server.url).post("/api/auth/login")
    .set("Content-Type", "application/json").send("{not json").expect(400);

  expect(res.headers["content-type"]).toMatch(/^application\/json/);
  expect(res.body.error).toEqual(expect.any(String));
});
