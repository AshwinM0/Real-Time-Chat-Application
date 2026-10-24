import { JavaRedisStore } from "../../middleware/javaRedisRateLimitStore.ts";
import { fakeRedis } from "../../test/fakeRedis.ts";

const WINDOW_MS = 60_000;

const storeOn = (redis: ReturnType<typeof fakeRedis>, prefix: string) => {
  const store = new JavaRedisStore(redis.pub, { prefix });
  // express-rate-limit passes all its options; the store reads only windowMs.
  store.init({ windowMs: WINDOW_MS } as any);
  return store;
};

test("BU-14: the first hit starts the window, and later hits keep its end", async () => {
  const redis = fakeRedis();
  const store = storeOn(redis, "rl:test:");

  const first = await store.increment("ann");
  const second = await store.increment("ann");

  expect(first.totalHits).toBe(1);
  expect(second.totalHits).toBe(2);
  expect(redis.values.get("rl:test:ann")).toBe(2);
  expect(first.resetTime!.getTime() - Date.now()).toBeGreaterThan(WINDOW_MS - 1000);
  // INCR doesn't move the TTL, so the window ends when it did.
  expect(Math.abs(second.resetTime!.getTime() - first.resetTime!.getTime())).toBeLessThan(1000);
});

test("BU-15: two stores with the same prefix, like two servers, share one count", async () => {
  const redis = fakeRedis();
  const serverA = storeOn(redis, "rl:test:");
  const serverB = storeOn(redis, "rl:test:");
  const otherLimiter = storeOn(redis, "rl:other:");

  await serverA.increment("ann");
  const { totalHits } = await serverB.increment("ann");

  expect(totalHits).toBe(2);
  expect((await otherLimiter.increment("ann")).totalHits).toBe(1);
});

test("BU-16: a counter left without a TTL gets one on its next hit", async () => {
  const redis = fakeRedis();
  const store = storeOn(redis, "rl:test:");
  // As if a server crashed between INCR and PEXPIRE.
  await redis.pub.incr("rl:test:ann");

  const { totalHits, resetTime } = await store.increment("ann");

  expect(totalHits).toBe(2);
  expect(await redis.pub.pTTL("rl:test:ann")).toBeGreaterThan(WINDOW_MS - 1000);
  expect(resetTime!.getTime() - Date.now()).toBeGreaterThan(WINDOW_MS - 1000);
});

test("BU-17: decrement takes back one hit, and resetKey clears the counter", async () => {
  const redis = fakeRedis();
  const store = storeOn(redis, "rl:test:");
  await store.increment("ann");
  await store.increment("ann");

  await store.decrement("ann");
  expect(redis.values.get("rl:test:ann")).toBe(1);

  await store.resetKey("ann");
  expect(redis.values.has("rl:test:ann")).toBe(false);
  expect((await store.increment("ann")).totalHits).toBe(1);
});

// redis-in-java closes each connection at REDIS_MAX_CONNECTION_AGE, between two
// commands. A command caught by that close never ran, and node-redis fails it with
// SocketClosedUnexpectedlyError; fakeRedis's failNext() does the same.
test("BU-18: a command whose connection closed before it ran is sent again", async () => {
  const redis = fakeRedis();
  const store = storeOn(redis, "rl:test:");
  // The close that was measured against redis-in-java: INCR ran, PTTL didn't.
  redis.failNext("pTTL");

  const { totalHits, resetTime } = await store.increment("ann");

  expect(totalHits).toBe(1);
  expect(redis.values.get("rl:test:ann")).toBe(1); // INCR wasn't repeated
  expect(resetTime!.getTime() - Date.now()).toBeGreaterThan(WINDOW_MS - 1000);
});

test("BU-19: a retried INCR counts once, and every other command is retried too", async () => {
  const redis = fakeRedis();
  const store = storeOn(redis, "rl:test:");
  for (const command of ["incr", "pExpire"] as const) redis.failNext(command);

  expect((await store.increment("ann")).totalHits).toBe(1);
  expect(await redis.pub.pTTL("rl:test:ann")).toBeGreaterThan(WINDOW_MS - 1000);

  redis.failNext("decr");
  await store.decrement("ann");
  expect(redis.values.get("rl:test:ann")).toBe(0);

  redis.failNext("del");
  await store.resetKey("ann");
  expect(redis.values.has("rl:test:ann")).toBe(false);
});

test("BU-20: only one retry, and only after a closed connection", async () => {
  const redis = fakeRedis();
  const store = storeOn(redis, "rl:test:");

  // Redis being down isn't retried: the request should fail fast.
  redis.failNext("incr", new Error("Redis is down"));
  await expect(store.increment("ann")).rejects.toThrow("Redis is down");

  // Closed twice in a row: give up rather than loop.
  redis.failNext("incr");
  redis.failNext("incr");
  await expect(store.increment("ann")).rejects.toThrow("Socket closed unexpectedly");
  expect(redis.values.has("rl:test:ann")).toBe(false);
});
