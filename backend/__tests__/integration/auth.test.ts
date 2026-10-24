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

  // Known gap: the controller doesn't validate input, so Mongoose rejects it later
  // and the catch turns that into a 500. These pass while the bug exists; when
  // validation is added they start failing, and should become normal tests.
  describe("BI-4: invalid input should be a 400 (currently 500)", () => {
    test.failing("missing full name", async () => {
      await request(server.url).post("/api/auth/signup").send(validSignup({ fullName: undefined })).expect(400);
    });
    test.failing("missing password", async () => {
      await request(server.url).post("/api/auth/signup")
        .send(validSignup({ password: undefined, confirmPassword: undefined })).expect(400);
    });
    test.failing("invalid gender", async () => {
      await request(server.url).post("/api/auth/signup").send(validSignup({ gender: "other" })).expect(400);
    });
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
