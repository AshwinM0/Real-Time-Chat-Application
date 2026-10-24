import http from "http"
import dotenv from "dotenv"

import { createApp } from "./app.js"
import connectToDB from "./db/connectToDB.js"
import { connectRedis, redisTlsOptions } from "./redis/client.js"
import { initSocket } from "./socket/socket.js"


dotenv.config()

// Stop now, with a clear message, if a required variable is missing. Otherwise the
// server starts and fails later in confusing ways: without JWT_SECRET every login
// fails, without MONGO_DB_URI every request waits 10 seconds and errors, and without
// PORT it listens on a random port the frontend can't find.
const missing = ["PORT", "MONGO_DB_URI", "JWT_SECRET"].filter((name) => !process.env[name])
if(missing.length) {
    console.error("Missing environment variables: " + missing.join(", ") + ". See .env.example.")
    process.exit(1)
}

const PORT = process.env.PORT

// Redis is optional. Without REDIS_URL, rate limits are kept in this server's memory.
// With it, stop if Redis can't be reached, or if its TLS settings are wrong: node-redis
// would otherwise keep retrying in the background while the server runs half-working.
let redis
if(process.env.REDIS_URL) {
    try {
        const tls = redisTlsOptions(process.env.REDIS_URL)
        redis = await connectRedis(process.env.REDIS_URL, { tls })
        console.log("Connected to Redis")
    } catch(e) {
        console.error("Could not connect to Redis: " + e.message)
        process.exit(1)
    }
}


// app.listen() would create an HTTP server internally and hide it. We create it
// ourselves so Express and Socket.IO can share it: one port serves both the
// REST API and the WebSocket connections.
const server = http.createServer(createApp({ redis }))
await initSocket(server, { redis })

server.listen(PORT, async () => {
    await connectToDB()
    console.log("listening on PORT "+PORT)
})
