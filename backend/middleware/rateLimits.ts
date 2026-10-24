import type { Request } from "express";
import { rateLimit, type AugmentedRequest, type Options } from "express-rate-limit";
import type { ParamsDictionary } from "express-serve-static-core";
import type { RedisClients } from "../redis/client.ts";
import type { ErrorBody, LoginBody } from "../types.ts";
import { errorMessage } from "../utils/errorMessage.ts";
import { JavaRedisStore } from "./javaRedisRateLimitStore.ts";
import { loggedInUser } from "./protectRoute.ts";

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
    override async decrement(key: string): Promise<void> {
        try {
            await super.decrement(key);
        } catch (e) {
            console.log("Rate limit: could not take back a hit: " + errorMessage(e));
        }
    }
}

// A limit from the environment, or the default when the variable isn't set.
const limitFromEnv = (name: string, defaultLimit: number): number => {
    const value = process.env[name];
    if (!value) return defaultLimit;
    const limit = Number(value);
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error(`${name} must be a whole number of at least 1, not "${value}"`);
    }
    return limit;
};

// "in 15 minutes", "in 8 seconds": the time until resetTime, rounded up. Both stores
// used here always say when the window ends. express-rate-limit's types allow one
// that doesn't, and then it's "later".
const timeLeft = (resetTime: Date | undefined): string => {
    if (!resetTime) return "later";
    const seconds = Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
    if (seconds < 60) return seconds === 1 ? "in 1 second" : `in ${seconds} seconds`;
    const minutes = Math.ceil(seconds / 60);
    return minutes === 1 ? "in 1 minute" : `in ${minutes} minutes`;
};

// One limiter: its counter's name, the variable that overrides its limit, and what
// it limits, for the 429's message. Anything else is passed to express-rate-limit.
interface LimiterSettings extends Partial<Options> {
    name: string;
    env: string;
    limit: number;
    windowMs: number;
    what: string;
}

export const createRateLimits = ({ redis }: { redis?: RedisClients } = {}) => {
    const client = redis?.pub.withCommandOptions({ timeout: STORE_TIMEOUT_MS });

    const limiter = ({ name, env, limit, windowMs, what, ...options }: LimiterSettings) => rateLimit({
        windowMs,
        limit: limitFromEnv(env, limit),
        standardHeaders: "draft-8",
        legacyHeaders: false,
        // Retry-After says the same, but a cross-origin frontend can't read that header
        // unless CORS exposes it. The body reaches every client.
        message: (req: AugmentedRequest): ErrorBody => ({ error: `Too many ${what}, try again ${timeLeft(req.rateLimit?.resetTime)}` }),
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
            // Runs before the login handler, on whatever was sent: the body can be
            // missing or incomplete, and String() copes with a username that isn't text.
            keyGenerator: (req: Request<ParamsDictionary, ErrorBody, Partial<LoginBody> | undefined>) =>
                String(req.body?.username ?? "").toLowerCase(),
            skipSuccessfulRequests: true,
            passOnStoreError: false,
        }),
        signupByIp: limiter({
            name: "signup:ip", env: "RATE_LIMIT_SIGNUP_PER_IP", limit: 10, windowMs: 60 * MINUTE, what: "sign-ups",
        }),
        // Stops one user flooding another. Goes after protectRoute, which sets req.user.
        sendByUser: limiter({
            name: "send:user", env: "RATE_LIMIT_SEND_PER_USER", limit: 20, windowMs: 10_000, what: "messages",
            keyGenerator: (req) => loggedInUser(req)._id.toString(),
        }),
    };
};

// The limiters, as the route files receive them.
export type RateLimits = ReturnType<typeof createRateLimits>;
