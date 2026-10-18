import request from "supertest";
import { startTestServer } from "../../test/testServer.js";

let server;
beforeAll(async () => { server = await startTestServer("cors_test"); });
afterAll(() => server.close());

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN;

// What the browser sends before a cross-origin JSON POST with cookies.
const preflight = (origin) =>
  request(server.url).options("/api/auth/login")
    .set("Origin", origin)
    .set("Access-Control-Request-Method", "POST")
    .set("Access-Control-Request-Headers", "content-type");

test("BI-16: a preflight from CLIENT_ORIGIN is allowed, with credentials", async () => {
  const res = await preflight(CLIENT_ORIGIN);
  expect(res.status).toBeLessThan(300);
  expect(res.headers["access-control-allow-origin"]).toBe(CLIENT_ORIGIN);
  expect(res.headers["access-control-allow-credentials"]).toBe("true");
});

test("BI-17: a preflight from any other origin is not allowed", async () => {
  const res = await preflight("http://evil.test");
  // cors() with a fixed origin always answers with that origin. The browser
  // compares it with its own and blocks the request, so the protection is that
  // the answer never names the other origin (or "*").
  expect(res.headers["access-control-allow-origin"]).not.toBe("http://evil.test");
  expect(res.headers["access-control-allow-origin"]).not.toBe("*");
});

test("BI-30: the Socket.IO polling handshake allows CLIENT_ORIGIN, with credentials", async () => {
  const res = await request(server.url).get("/socket.io/?EIO=4&transport=polling")
    .set("Origin", CLIENT_ORIGIN).expect(200);
  expect(res.headers["access-control-allow-origin"]).toBe(CLIENT_ORIGIN);
  expect(res.headers["access-control-allow-credentials"]).toBe("true");
});
