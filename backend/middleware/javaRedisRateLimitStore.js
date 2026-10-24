import { SocketClosedUnexpectedlyError } from "redis";

// An express-rate-limit store that needs only INCR, PTTL, PEXPIRE, DECR and DEL,
// which redis-in-java supports. rate-limit-redis can't be used: it runs a Lua
// script (SCRIPT LOAD + EVALSHA), and the server has no scripting.
//
// Every server shares one counter per key, so the limit holds however many
// servers there are.

// Runs one command, and once more if the connection closed before its reply came.
// redis-in-java closes every connection at REDIS_MAX_CONNECTION_AGE, but only between
// two commands and only after sending every reply, so a command that got no reply
// never ran and can safely be sent again. node-redis holds the retry until it has
// reconnected. Without this, a login checked at that moment fails with a 500.
// (After a real network failure a command can run and lose its reply; resending INCR
// or DECR is then off by one hit, which this accepts.)
const retryIfClosed = async (command) => {
    try {
        return await command();
    } catch (e) {
        if (!(e instanceof SocketClosedUnexpectedlyError)) throw e;
        return command();
    }
};

export class JavaRedisStore {
    constructor(client, { prefix = "rl:" } = {}) {
        this.client = client;
        this.prefix = prefix;
        this.localKeys = false; // counts are shared between servers
    }

    init(options) {
        this.windowMs = options.windowMs;
    }

    async increment(key) {
        const k = this.prefix + key;
        // Sent together, so this costs one round trip. INCR keeps an existing TTL.
        // Each is retried on its own: the server can close the connection between
        // the two, after INCR has run, and repeating that INCR would count twice.
        const [totalHits, pttl] = await Promise.all([
            retryIfClosed(() => this.client.incr(k)),
            retryIfClosed(() => this.client.pTTL(k)),
        ]);
        let msLeft = pttl;
        // -1: the INCR just created the key, or a crash between INCR and PEXPIRE left
        // it without a TTL. Either way, start the window now. Checking here instead of
        // only when totalHits === 1 is what stops a key from living forever.
        if (pttl < 0) {
            await retryIfClosed(() => this.client.pExpire(k, this.windowMs));
            msLeft = this.windowMs;
        }
        return { totalHits, resetTime: new Date(Date.now() + msLeft) };
    }

    async decrement(key) {
        await retryIfClosed(() => this.client.decr(this.prefix + key));
    }

    async resetKey(key) {
        await retryIfClosed(() => this.client.del(this.prefix + key));
    }
}
