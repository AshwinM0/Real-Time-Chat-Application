import http from "http"
import dotenv from "dotenv"

import { createApp } from "./app.ts"
import connectToDB from "./db/connectToDB.ts"
import { connectRedis, redisTlsOptions, type RedisClients } from "./redis/client.ts"
import { initSocket } from "./socket/socket.ts"
import { errorMessage } from "./utils/errorMessage.ts"


dotenv.config()

// Stop now, with a clear message, if a required variable is missing. Otherwise the
// server starts and fails later in confusing ways: without JWT_SECRET every login
// fails, without MONGO_DB_URI every request waits 10 seconds and errors, and without
// PORT it listens on a random port the frontend can't find.
const { PORT, MONGO_DB_URI, JWT_SECRET, REDIS_URL } = process.env
if(!PORT || !MONGO_DB_URI || !JWT_SECRET) {
    const missing = Object.entries({ PORT, MONGO_DB_URI, JWT_SECRET }).filter(([, value]) => !value).map(([name]) => name)
    console.error("Missing environment variables: " + missing.join(", ") + ". See .env.example.")
    process.exit(1)
}

// Redis is optional. Without REDIS_URL, rate limits are kept in this server's memory.
// With it, stop if Redis can't be reached, or if its TLS settings are wrong: node-redis
// would otherwise keep retrying in the background while the server runs half-working.
let redis: RedisClients | undefined
if(REDIS_URL) {
    try {
        const tls = redisTlsOptions(REDIS_URL)
        redis = await connectRedis(REDIS_URL, { tls })
        console.log("Connected to Redis")
    } catch(e) {
        console.error("Could not connect to Redis: " + errorMessage(e))
        process.exit(1)
    }
}


// app.listen() would create an HTTP server internally and hide it. We create it
// ourselves so Express and Socket.IO can share it: one port serves both the
// REST API and the WebSocket connections.
const server = http.createServer(createApp({ redis }))
await initSocket(server, { redis })

server.listen(Number(PORT), async () => {
    await connectToDB(MONGO_DB_URI)
    console.log("listening on PORT "+PORT)
})
