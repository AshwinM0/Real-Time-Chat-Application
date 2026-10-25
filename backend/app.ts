import express, { type ErrorRequestHandler } from "express"
import cors from "cors"
import type { ParamsDictionary } from "express-serve-static-core"

import authRoutes from "./routes/authRoutes.ts"
import messageRoutes from "./routes/messageRoutes.ts"
import protectRoute from "./middleware/protectRoute.ts"
import { createRateLimits } from "./middleware/rateLimits.ts"
import type { RedisOptions } from "./redis/client.ts"
import userRoutes from "./routes/userRoutes.ts"
import type { ErrorBody } from "./types.ts"
import { errorMessage } from "./utils/errorMessage.ts"

// TRUST_PROXY: how many proxies, such as a load balancer, sit in front of the server.
// Express then reads the client's address from X-Forwarded-For. Without it, req.ip is
// the proxy's address, and every user shares one per-IP rate limit. Never set more
// than there are: clients could then fake their address. Express's other forms, such
// as "loopback" or a list of addresses, work too.
const trustProxy = (value: string): number | string => /^\d+$/.test(value) ? Number(value) : value

// Errors passed to next(), such as a login while the rate-limit store is down.
// Express's own answer is an HTML page, with the stack trace outside production,
// which the frontend can't show. Anything can be passed to next(), hence unknown.
// eslint-disable-next-line no-restricted-syntax -- next() accepts any value
const handleError: ErrorRequestHandler<ParamsDictionary, ErrorBody> = (err: unknown, req, res, next) => {
    if(res.headersSent) return next(err)
    // body-parser's errors carry the status to answer with (400 for malformed JSON)
    // and a message meant for the client.
    const status = err instanceof Error && "status" in err && typeof err.status === "number" ? err.status : 500
    if(status >= 500) console.log("Error in " + req.method + " " + req.originalUrl + ": " + errorMessage(err))
    res.status(status).json({error : status < 500 ? errorMessage(err) : "Internal Server Error"})
}

// Builds the Express app without connecting to MongoDB or listening on a port.
// server.ts wires it to a real port; tests serve it on a random free one.
// redis: the clients from connectRedis() when REDIS_URL is set, so rate limits are
// shared between servers. Without it they're kept in memory.
export const createApp = ({ redis }: RedisOptions = {}) => {
    const app = express()

    if(process.env.TRUST_PROXY) app.set("trust proxy", trustProxy(process.env.TRUST_PROXY))

    const limits = createRateLimits({ redis })

    app.use(express.json())


    const corsOptions = {
        origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
        credentials: true,
    }


    // Each route's cors() answers its preflight requests too. The limiters run after
    // it, so a 429 carries the CORS headers and the frontend can read its message.
    app.use("/api/auth", cors(corsOptions) , authRoutes(limits))

    app.use("/api/messages", cors(corsOptions), protectRoute, messageRoutes(limits))

    app.use('/api/users', cors(corsOptions), userRoutes)

    app.use(handleError)

    return app
}
