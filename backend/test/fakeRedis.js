import { SocketClosedUnexpectedlyError } from "redis";

// A stand-in for the Redis clients connectRedis() returns, holding keys in memory.
// It has only the commands the rate-limit store uses, with Redis's rules for them:
// INCR keeps a key's TTL, and PTTL is -1 for a key without one and -2 for a missing
// key. Lets the Redis code run in tests without a Redis server; it was checked
// against the real redis-in-java by hand.
//
// failNext("incr") makes the next INCR fail without running, the way node-redis
// fails a command whose connection closed before it ran (redis-in-java's
// REDIS_MAX_CONNECTION_AGE). Pass another error to fail differently; call it twice
// to fail twice.
export function fakeRedis() {
  const values = new Map(); // key -> number
  const expiresAt = new Map(); // key -> time in ms, for keys with a TTL
  const failures = new Map(); // command -> errors to throw, oldest first
  const failNext = (command, error = new SocketClosedUnexpectedlyError()) => {
    failures.set(command, [...(failures.get(command) ?? []), error]);
  };
  // Commands check this first, so a failed one changes nothing.
  const maybeFail = (command) => {
    const error = failures.get(command)?.shift();
    if (error) throw error;
  };

  // Drops the key first if it has expired, like Redis does when it's read.
  const exists = (key) => {
    if (expiresAt.get(key) <= Date.now()) {
      values.delete(key);
      expiresAt.delete(key);
    }
    return values.has(key);
  };
  const add = (key, n) => {
    const value = (exists(key) ? values.get(key) : 0) + n;
    values.set(key, value);
    return value;
  };

  const pub = {
    incr: async (key) => {
      maybeFail("incr");
      return add(key, 1);
    },
    decr: async (key) => {
      maybeFail("decr");
      return add(key, -1);
    },
    pTTL: async (key) => {
      maybeFail("pTTL");
      if (!exists(key)) return -2;
      return expiresAt.has(key) ? expiresAt.get(key) - Date.now() : -1;
    },
    pExpire: async (key, ms) => {
      maybeFail("pExpire");
      if (!exists(key)) return 0;
      expiresAt.set(key, Date.now() + ms);
      return 1;
    },
    del: async (key) => {
      maybeFail("del");
      const existed = exists(key);
      values.delete(key);
      expiresAt.delete(key);
      return existed ? 1 : 0;
    },
    withCommandOptions: () => pub,
  };
  return { pub, values, expiresAt, failNext };
}

// Redis clients whose every command fails, as during an outage.
export function brokenRedis() {
  const fail = async () => { throw new Error("Redis is down"); };
  const pub = { incr: fail, decr: fail, pTTL: fail, pExpire: fail, del: fail, withCommandOptions: () => pub };
  return { pub };
}
