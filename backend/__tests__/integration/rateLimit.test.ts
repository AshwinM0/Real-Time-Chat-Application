import { jest } from "@jest/globals";
import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import Message from "../../models/messageModel.ts";
import User from "../../models/userModel.ts";
import { createApp } from "../../app.ts";
import { startTestServer, type TestServer } from "../../test/testServer.ts";
import { signUp, type TestUser } from "../../test/factories.ts";
import { fakeRedis, brokenRedis } from "../../test/fakeRedis.ts";

// Users are signed up through this server, which has the suite's high limits
// (test/env.ts), so making them never counts against the limits under test.
let setup: TestServer;
beforeAll(async () => { setup = await startTestServer("rate_limit_test"); });
afterAll(() => setup.close());

// Every server started after this has these limits, and trusts one proxy, so a
// test can send requests from different addresses with X-Forwarded-For.
const LOW_LIMITS: Record<string, string> = {
  RATE_LIMIT_LOGIN_PER_IP: "4",
  RATE_LIMIT_LOGIN_PER_USER: "3",
  RATE_LIMIT_SIGNUP_PER_IP: "2",
  RATE_LIMIT_SEND_PER_USER: "3",
  TRUST_PROXY: "1",
};

// A server under test: its own app, so its own counters, on the same database.
// It has no Socket.IO of its own; sendMessage pushes through the setup server's.
const servers: http.Server[] = [];
async function startServer({ redis, env = LOW_LIMITS }: { redis?: any; env?: Record<string, string> } = {}) {
  const saved = Object.fromEntries(Object.keys(env).map((name) => [name, process.env[name]]));
  Object.assign(process.env, env);
  const httpServer = http.createServer(createApp({ redis }));
  for (const [name, value] of Object.entries(saved)) {
    // Assigning undefined would store the string "undefined".
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  servers.push(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  return { url: `http://localhost:${(httpServer.address() as AddressInfo).port}` };
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))));
  await setup.reset();
});

type Server = { url: string };

const login = (server: Server, username: string, password: string, ip = "10.0.0.1") =>
  request(server.url).post("/api/auth/login").set("X-Forwarded-For", ip).send({ username, password });

const signUpFrom = (server: Server, ip: string, username: string) =>
  request(server.url).post("/api/auth/signup").set("X-Forwarded-For", ip).send({
    fullName: "Test User", username, password: "secret123", confirmPassword: "secret123", gender: "female",
  });

const send = (server: Server, from: TestUser, to: { id: string }, message: string) =>
  request(server.url).post(`/api/messages/send/${to.id}`).set("Cookie", from.cookie).send({ message });

// Retries check() for up to half a second, until it stops throwing. A limiter takes
// back a successful login's hit only once the response has gone out.
async function eventually(check: () => void) {
  for (let i = 0; i < 50; i++) {
    try { return check(); } catch { await new Promise((resolve) => setTimeout(resolve, 10)); }
  }
  return check();
}

describe("login", () => {
  test("BI-50: after the per-username limit, that username is refused from any address, even with the right password", async () => {
    const server = await startServer();
    const [ann, bob] = await Promise.all([signUp(setup, "ann"), signUp(setup, "bob")]);

    // One guess each from three addresses: below every per-address limit.
    for (const ip of ["10.0.0.1", "10.0.0.2", "10.0.0.3"]) {
      await login(server, ann.username, "wrong", ip).expect(400);
    }

    await login(server, ann.username, "wrong", "10.0.0.4").expect(429);
    await login(server, ann.username, "secret123", "10.0.0.5").expect(429);
    // The username is counted without case.
    await login(server, ann.username.toUpperCase(), "secret123", "10.0.0.6").expect(429);
    // Other users aren't affected, from the same addresses.
    await login(server, bob.username, "secret123", "10.0.0.1").expect(200);
  });

  test("BI-51: after the per-address limit, that address is refused for every username", async () => {
    const server = await startServer();
    const ann = await signUp(setup, "ann");

    for (const name of ["nobody1", "nobody2", "nobody3", "nobody4"]) {
      await login(server, name, "wrong", "10.0.1.1").expect(400);
    }

    await login(server, "nobody5", "wrong", "10.0.1.1").expect(429);
    await login(server, ann.username, "secret123", "10.0.1.1").expect(429);
    await login(server, ann.username, "secret123", "10.0.1.2").expect(200);
  });

  test("BI-52: successful logins don't count towards either limit", async () => {
    const server = await startServer();
    const ann = await signUp(setup, "ann");

    // More than both limits.
    for (let i = 0; i < 5; i++) await login(server, ann.username, "secret123").expect(200);

    // All three failures the per-username limit allows are still left.
    for (let i = 0; i < 3; i++) await login(server, ann.username, "wrong").expect(400);
    await login(server, ann.username, "wrong").expect(429);
  });

  test("BI-53: a 429 is JSON saying when to try again, with headers the browser can read it under", async () => {
    const server = await startServer();
    const ann = await signUp(setup, "ann");
    for (let i = 0; i < 3; i++) await login(server, ann.username, "wrong").expect(400);

    const res = await login(server, ann.username, "wrong").set("Origin", process.env.CLIENT_ORIGIN!).expect(429);

    expect(res.body).toEqual({ error: "Too many login attempts, try again in 15 minutes" });
    // Without this the browser would hide the response from the frontend.
    expect(res.headers["access-control-allow-origin"]).toBe(process.env.CLIENT_ORIGIN);
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(14 * 60);
    expect(res.headers["ratelimit-policy"]).toContain("q=3; w=900");
    expect(res.headers).not.toHaveProperty("x-ratelimit-limit");
  });
});

test("BI-54: after the sign-up limit, an address can't sign up again, and nothing is created", async () => {
  const server = await startServer();

  await signUpFrom(server, "10.0.2.1", "signup_a").expect(201);
  await signUpFrom(server, "10.0.2.1", "signup_b").expect(201);
  const res = await signUpFrom(server, "10.0.2.1", "signup_c").expect(429);

  expect(res.body.error).toBe("Too many sign-ups, try again in 60 minutes");
  expect(await User.exists({ username: "signup_c" })).toBeNull();
  await signUpFrom(server, "10.0.2.2", "signup_c").expect(201);
});

test("BI-55: after the sending limit, a user's messages are refused and not saved, while others can still send", async () => {
  const server = await startServer();
  const [ann, bob] = await Promise.all([signUp(setup, "ann"), signUp(setup, "bob")]);

  for (const text of ["one", "two", "three"]) await send(server, ann, bob, text).expect(201);
  const res = await send(server, ann, bob, "four").expect(429);

  expect(res.body.error).toMatch(/^Too many messages, try again in \d+ seconds?$/);
  expect(await Message.countDocuments({ senderId: ann.id })).toBe(3);
  await send(server, bob, ann, "reply").expect(201);
});

test("BI-56: without RATE_LIMIT_* settings, the limits are the defaults", async () => {
  const unset = { RATE_LIMIT_LOGIN_PER_IP: "", RATE_LIMIT_LOGIN_PER_USER: "", RATE_LIMIT_SIGNUP_PER_IP: "", RATE_LIMIT_SEND_PER_USER: "" };
  const server = await startServer({ env: { ...LOW_LIMITS, ...unset } });
  const ann = await signUp(setup, "ann");

  const loginRes = await request(server.url).post("/api/auth/login").send({ username: ann.username, password: "secret123" });
  const signupRes = await signUpFrom(server, "10.0.3.1", "defaults_user");
  const sendRes = await send(server, ann, { id: signupRes.body._id }, "hi");

  // Per address and per username, 15 minutes each.
  expect(loginRes.headers["ratelimit-policy"]).toMatch(/q=20; w=900;.*q=5; w=900;/);
  expect(signupRes.headers["ratelimit-policy"]).toContain("q=10; w=3600;");
  expect(sendRes.headers["ratelimit-policy"]).toContain("q=20; w=10;");
});

test("BI-57: a limit that isn't a positive whole number stops the app from starting", () => {
  process.env.RATE_LIMIT_SEND_PER_USER = "ten";
  try {
    expect(() => createApp()).toThrow('RATE_LIMIT_SEND_PER_USER must be a whole number of at least 1, not "ten"');
  } finally {
    process.env.RATE_LIMIT_SEND_PER_USER = "100000";
  }
});

describe("with Redis", () => {
  test("BI-58: two servers sharing Redis enforce one limit between them", async () => {
    const redis = fakeRedis();
    const [serverA, serverB] = await Promise.all([startServer({ redis }), startServer({ redis })]);
    const [ann, bob] = await Promise.all([signUp(setup, "ann"), signUp(setup, "bob")]);

    await login(serverA, ann.username, "wrong", "10.0.4.1").expect(400);
    await login(serverB, ann.username, "wrong", "10.0.4.2").expect(400);
    await login(serverA, ann.username, "wrong", "10.0.4.3").expect(400);
    await login(serverB, ann.username, "wrong", "10.0.4.4").expect(429);

    // Successful logins on either server take their hit back.
    await login(serverA, bob.username, "secret123").expect(200);
    await login(serverB, bob.username, "secret123").expect(200);
    const userKey = (u: TestUser) => `rl:login:user:${u.username.toLowerCase()}`;
    expect(redis.values.get(userKey(ann))).toBe(4);
    await eventually(() => expect(redis.values.get(userKey(bob))).toBe(0));
    // Every counter expires with its window.
    for (const key of redis.values.keys()) expect(redis.expiresAt.has(key)).toBe(true);
  });

  describe("when Redis fails", () => {
    beforeEach(() => {
      jest.spyOn(console, "error").mockImplementation(() => {});
      jest.spyOn(console, "log").mockImplementation(() => {});
    });
    afterEach(() => jest.restoreAllMocks());

    test("BI-59: logins are refused with a 500, while sign-ups and messages go through unlimited", async () => {
      const server = await startServer({ redis: brokenRedis() });
      const [ann, bob] = await Promise.all([signUp(setup, "ann"), signUp(setup, "bob")]);

      const res = await login(server, ann.username, "secret123").expect(500);
      expect(res.body).toEqual({ error: "Internal Server Error" });

      await signUpFrom(server, "10.0.5.1", "outage_user").expect(201);
      await send(server, ann, bob, "still delivered").expect(201);
      expect(console.error).toHaveBeenCalledWith(
        "express-rate-limit: error from store, allowing request without rate-limiting.", expect.any(Error),
      );
    });

    test("BI-60: a failure taking back a successful login's hit is logged, not thrown", async () => {
      const redis = fakeRedis();
      redis.pub.decr = async () => { throw new Error("Redis is down"); };
      const server = await startServer({ redis });
      const ann = await signUp(setup, "ann");

      await login(server, ann.username, "secret123").expect(200);

      await eventually(() => expect(console.log).toHaveBeenCalledWith("Rate limit: could not take back a hit: Redis is down"));
    });
  });
});
