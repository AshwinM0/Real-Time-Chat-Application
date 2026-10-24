import { jest } from "@jest/globals";
import net, { type AddressInfo } from "node:net";
import { connectRedis } from "../../redis/client.ts";

// A stand-in Redis server. With RESP2, no password and no client info, PING is the
// only command the clients send. The real server, redis-in-java, was checked by hand.
let server: net.Server;
const sockets = new Set<net.Socket>();
async function listen(onData: (socket: net.Socket, data: Buffer) => void) {
  server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    // Clients that give up reset the connection.
    socket.on("error", () => {});
    socket.on("data", (data) => onData(socket, data));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `redis://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
// Answers each PING with `reply`, or never answers.
const startFakeRedis = (reply: string | null) => listen((socket, data) => {
  if (!reply) return;
  for (const _ of data.toString().matchAll(/PING/g)) socket.write(reply);
});
afterEach(() => new Promise((resolve) => server.close(resolve)));

// Retries check() for up to two seconds, until it stops throwing.
async function eventually(check: () => void) {
  for (let waited = 0; ; waited += 20) {
    try { return check(); } catch (e) { if (waited >= 2000) throw e; }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test("BI-61: connects both clients when the server answers", async () => {
  const url = await startFakeRedis("+PONG\r\n");

  const { pub, sub } = await connectRedis(url);

  expect(pub.isReady && sub.isReady).toBe(true);
  pub.destroy();
  sub.destroy();
});

test("BI-62: a server that refuses commands, such as one that needs a password, fails the connection", async () => {
  const url = await startFakeRedis("-NOAUTH Authentication required.\r\n");

  await expect(connectRedis(url)).rejects.toThrow("NOAUTH Authentication required.");
});

test("BI-63: a server that never answers fails the connection after the timeout", async () => {
  const url = await startFakeRedis(null);
  jest.spyOn(console, "log").mockImplementation(() => {});

  await expect(connectRedis(url, { timeoutMs: 200 })).rejects.toThrow("no answer (gave up after 0.2 s)");
  jest.restoreAllMocks();
});

test("BI-65: a TLS port reached with redis:// fails, saying to use rediss://", async () => {
  // redis-in-java's TLS port answers plaintext with a TLS alert and hangs up.
  // node-redis reports its first byte as "Unknown RESP type 21".
  const url = await listen((socket) => socket.end(Buffer.from([0x15, 0x03, 0x03, 0x00, 0x02, 0x02, 0x28])));
  jest.spyOn(console, "log").mockImplementation(() => {});

  await expect(connectRedis(url, { timeoutMs: 1000 })).rejects.toThrow("the server speaks TLS: use a rediss:// URL");
  jest.restoreAllMocks();
});

test("BI-66: when the server closes the connections, as redis-in-java does at REDIS_MAX_CONNECTION_AGE, the clients reconnect", async () => {
  const url = await startFakeRedis("+PONG\r\n");
  const log = jest.spyOn(console, "log").mockImplementation(() => {});
  const { pub, sub } = await connectRedis(url);

  // A clean close between commands, like redis-in-java's.
  for (const socket of sockets) socket.end();

  await eventually(() => expect(log).toHaveBeenCalledWith("Redis closed the connection; reconnecting"));
  // Logged as a reconnect, not as an error.
  expect(log.mock.calls.flat().filter((line) => String(line).startsWith("Redis error"))).toEqual([]);
  expect(await pub.ping()).toBe("PONG");
  expect(await sub.ping()).toBe("PONG");
  pub.destroy();
  sub.destroy();
  jest.restoreAllMocks();
});
