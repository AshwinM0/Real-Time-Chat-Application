import { rateLimit } from "express-rate-limit";
import { JavaRedisStore } from "./javaRedisRateLimitStore.js";

// Limits on the routes that brute-force guessing or flooding would hit. Each one
// counts requests per client in a fixed window. With Redis (REDIS_URL) the counts
// are shared by every server; without it they live in this server's memory.
//
// The limits are defaults that the RATE_LIMIT_* variables override. The test suites
// raise them, because they sign up and log in many users from one address.

const MINUTE = 60_000;

// How long a rate-limit command may wait for Redis. While Redis is down, node-redis
// queues commands until it reconnects, which would hold every limited request for
// the whole outage. Timing out turns that into a store error instead, which
// passOnStoreError below decides about.
const STORE_TIMEOUT_MS = 1000;

// express-rate-limit takes back a skipped request's hit after the response has been
// sent, with nothing to catch a failure. An unhandled rejection stops Node, so Redis
// going down at that moment would take the whole server with it. Log it instead:
// the hit then stays counted until the window ends.
class RedisStore extends JavaRedisStore {
    async decrement(key) {
        try {
            await super.decrement(key);
        } catch (e) {
            // node-redis's TimeoutError has no message.
            console.log("Rate limit: could not take back a hit: " + (e.message || e.constructor.name));
        }
    }
}

// A limit from the environment, or the default when the variable isn't set.
const limitFromEnv = (name, defaultLimit) => {
    const value = process.env[name];
    if (!value) return defaultLimit;
    const limit = Number(value);
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error(`${name} must be a whole number of at least 1, not "${value}"`);
    }
    return limit;
};

// "15 minutes", "8 seconds": the time until resetTime, rounded up.
const timeLeft = (resetTime) => {
    const seconds = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
    if (seconds < 60) return seconds === 1 ? "1 second" : `${seconds} seconds`;
    const minutes = Math.ceil(seconds / 60);
    return minutes === 1 ? "1 minute" : `${minutes} minutes`;
};

export const createRateLimits = ({ redis } = {}) => {
    const client = redis?.pub.withCommandOptions({ timeout: STORE_TIMEOUT_MS });

    const limiter = ({ name, env, limit, windowMs, what, ...options }) => rateLimit({
        windowMs,
        limit: limitFromEnv(env, limit),
        standardHeaders: "draft-8",
        legacyHeaders: false,
        // Retry-After says the same, but a cross-origin frontend can't read that header
        // unless CORS exposes it. The body reaches every client.
        message: (req) => ({ error: `Too many ${what}, try again in ${timeLeft(req.rateLimit.resetTime)}` }),
        // Its own store and key prefix for each limiter: express-rate-limit refuses a
        // store shared between two limiters. Without Redis, its MemoryStore.
        store: client && new RedisStore(client, { prefix: `rl:${name}:` }),
        // If Redis fails, let the request through unlimited rather than refuse it.
        passOnStoreError: true,
        ...options,
    });

    return {
        loginByIp: limiter({
            name: "login:ip", env: "RATE_LIMIT_LOGIN_PER_IP", limit: 20, windowMs: 15 * MINUTE, what: "login attempts",
            // Only failed logins count.
            skipSuccessfulRequests: true,
            // Refuse logins while the limit can't be checked: guessing passwords
            // unlimited is worse than nobody logging in for the length of an outage.
            passOnStoreError: false,
        }),
        // Stops guesses at one account spread across many addresses.
        loginByUser: limiter({
            name: "login:user", env: "RATE_LIMIT_LOGIN_PER_USER", limit: 5, windowMs: 15 * MINUTE, what: "login attempts",
            keyGenerator: (req) => String(req.body?.username ?? "").toLowerCase(),
            skipSuccessfulRequests: true,
            passOnStoreError: false,
        }),
        signupByIp: limiter({
            name: "signup:ip", env: "RATE_LIMIT_SIGNUP_PER_IP", limit: 10, windowMs: 60 * MINUTE, what: "sign-ups",
        }),
        // Stops one user flooding another. Goes after protectRoute, which sets req.user.
        sendByUser: limiter({
            name: "send:user", env: "RATE_LIMIT_SEND_PER_USER", limit: 20, windowMs: 10_000, what: "messages",
            keyGenerator: (req) => req.user._id.toString(),
        }),
    };
};
