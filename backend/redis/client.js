import { readFileSync } from "node:fs";
import { createClient, SocketClosedUnexpectedlyError } from "redis";

// redis-in-java speaks RESP2 only and has no HELLO/CLIENT commands. node-redis 6
// opens with HELLO 3 and treats its failure as fatal, retrying forever, so turn the
// handshakes off. These options also work against real Redis.
const COMPAT = { RESP: 2, maintNotifications: "disabled", disableClientInfo: true };

// The files a TLS connection needs, read from the paths in REDIS_TLS_CA,
// REDIS_TLS_CERT and REDIS_TLS_KEY (PEM). The URL is what turns TLS on: rediss://.
// node-redis refuses to combine socket.tls with redis://, and the files would be
// ignored over plaintext, so setting them without rediss:// is an error.
//   REDIS_TLS_CA    the authority that signed the server's certificate, when Node
//                   doesn't already trust it (a self-signed or private one)
//   REDIS_TLS_CERT  this backend's certificate and key, for a server that requires
//   REDIS_TLS_KEY   client certificates (redis-in-java's REDIS_TLS_CLIENT_CA)
// Throws, saying what to fix, when the settings don't add up.
export const redisTlsOptions = (url, env = process.env) => {
    const paths = { ca: env.REDIS_TLS_CA, cert: env.REDIS_TLS_CERT, key: env.REDIS_TLS_KEY };
    const given = Object.entries(paths).filter(([, path]) => path);
    if(!given.length) return {};

    if(!url.toLowerCase().startsWith("rediss://")) {
        throw new Error("REDIS_TLS_* is set, but REDIS_URL doesn't start with rediss://, so the connection wouldn't be encrypted");
    }
    if(Boolean(paths.cert) !== Boolean(paths.key)) {
        throw new Error("set REDIS_TLS_CERT and REDIS_TLS_KEY together: a client certificate is no use without its key");
    }
    return Object.fromEntries(given.map(([name, path]) => {
        try {
            return [name, readFileSync(path)];
        } catch(e) {
            throw new Error(`could not read REDIS_TLS_${name.toUpperCase()} (${path}): ${e.message}`);
        }
    }));
};

// The two clients CHAT uses, not connected yet. tls: what redisTlsOptions() returns.
export const createRedisClients = (url, { tls = {} } = {}) => {
    const pub = createClient({ url, ...COMPAT, socket: { ...tls } });
    // The adapter subscribes on its own connection, which can't run other commands.
    // pub also serves presence, rate limits and locks. duplicate() keeps the URL,
    // password and TLS files.
    const sub = pub.duplicate();
    return { pub, sub };
};

// node-redis's errors for a TLS mismatch describe the symptom, not the setting to fix.
const hint = (reason = "") => {
    // 21 is the first byte of a TLS alert: the port speaks TLS, the client didn't.
    if(reason.includes("Unknown RESP type 21")) return " (the server speaks TLS: use a rediss:// URL)";
    if(/self-signed certificate|unable to verify|unable to get local issuer/.test(reason)) {
        return " (the server's certificate isn't trusted: set REDIS_TLS_CA to the authority that signed it)";
    }
    if(reason.includes("certificate required")) {
        return " (the server requires a client certificate: set REDIS_TLS_CERT and REDIS_TLS_KEY)";
    }
    return "";
};

// Connects the two clients CHAT uses, or rejects with the reason. node-redis never
// gives up on its own: it retries a refused connection or a wrong password forever,
// so after timeoutMs this stops it and rejects instead.
export const connectRedis = async (url, { timeoutMs = 5000, tls } = {}) => {
    const { pub, sub } = createRedisClients(url, { tls });

    // The most telling error so far, for the message if connecting fails. "Socket
    // closed unexpectedly" says the least, so it never replaces a more specific one.
    let reason;
    const note = (e) => {
        // OpenSSL's messages end with a line break.
        if(!reason || !(e instanceof SocketClosedUnexpectedlyError)) reason = (e.message || e.constructor.name).trim();
    };
    // Without an "error" listener, a dropped connection crashes the process.
    for (const c of [pub, sub]) c.on("error", (e) => {
        note(e);
        // The server ended the connection. redis-in-java does this on purpose at
        // REDIS_MAX_CONNECTION_AGE; node-redis reconnects and logs in again by itself.
        if(e instanceof SocketClosedUnexpectedlyError) console.log("Redis closed the connection; reconnecting");
        else console.log("Redis error: " + e.message);
    });

    const ready = (async () => {
        await Promise.all([pub.connect(), sub.connect()]);
        // Connecting succeeds without a password even when the server requires one,
        // and every command then fails with NOAUTH. Find out now, not on the first request.
        await Promise.all([pub.ping(), sub.ping()]);
    })();
    const timedOut = new Error();
    let timer;
    const deadline = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(timedOut), timeoutMs);
    });

    try {
        await Promise.race([ready, deadline]);
        return { pub, sub };
    } catch (e) {
        // Stop the retries. Closing also rejects the connect() still in progress.
        ready.catch(() => {});
        pub.destroy();
        sub.destroy();
        if(e !== timedOut) note(e);
        const why = (reason ?? "no answer") + hint(reason);
        throw new Error(e === timedOut ? `${why} (gave up after ${timeoutMs / 1000} s)` : why);
    } finally {
        clearTimeout(timer);
    }
};
