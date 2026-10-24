import express from "express"
import cookieParser from "cookie-parser"
import cors from "cors"

import authRoutes from "./routes/authRoutes.js"
import messageRoutes from "./routes/messageRoutes.js"
import protectRoute from "./middleware/protectRoute.js"
import { createRateLimits } from "./middleware/rateLimits.js"
import userRoutes from "./routes/userRoutes.js"

// TRUST_PROXY: how many proxies, such as a load balancer, sit in front of the server.
// Express then reads the client's address from X-Forwarded-For. Without it, req.ip is
// the proxy's address, and every user shares one per-IP rate limit. Never set more
// than there are: clients could then fake their address. Express's other forms, such
// as "loopback" or a list of addresses, work too.
const trustProxy = (value) => /^\d+$/.test(value) ? Number(value) : value

// Builds the Express app without connecting to MongoDB or listening on a port.
// server.js wires it to a real port; tests serve it on a random free one.
// redis: the clients from connectRedis() when REDIS_URL is set, so rate limits are
// shared between servers. Without it they're kept in memory.
export const createApp = ({ redis } = {}) => {
    const app = express()

    if(process.env.TRUST_PROXY) app.set("trust proxy", trustProxy(process.env.TRUST_PROXY))

    const limits = createRateLimits({ redis })

    app.use(cookieParser())
    app.use(express.json())
    app.options(cors())


    var corsOptions = {
        origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
        credentials: true,
    }


    // The limiters run after cors(), so a 429 carries the CORS headers and the
    // frontend can read its message.
    app.use("/api/auth", cors(corsOptions) , authRoutes(limits))

    app.use("/api/messages", cors(corsOptions), protectRoute, messageRoutes(limits))

    app.use('/api/users', cors(corsOptions), userRoutes)

    // Errors passed to next(), such as a login while the rate-limit store is down.
    // Express's own answer is an HTML page, with the stack trace outside production,
    // which the frontend can't show.
    app.use((err, req, res, next) => {
        if(res.headersSent) return next(err)
        // body-parser sets status (400 for malformed JSON) and a message meant for the client.
        const status = err.status ?? 500
        // Some errors have no message, such as node-redis's TimeoutError.
        if(status >= 500) console.log("Error in " + req.method + " " + req.originalUrl + ": " + (err.message || err.constructor.name))
        res.status(status).json({error : status < 500 ? err.message : "Internal Server Error"})
    })

    return app
}
