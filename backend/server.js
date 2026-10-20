import http from "http"
import dotenv from "dotenv"

import { createApp } from "./app.js"
import connectToDB from "./db/connectToDB.js"
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


// app.listen() would create an HTTP server internally and hide it. We create it
// ourselves so Express and Socket.IO can share it: one port serves both the
// REST API and the WebSocket connections.
const server = http.createServer(createApp())
initSocket(server)

server.listen(PORT, async () => {
    await connectToDB()
    console.log("listening on PORT "+PORT)
})
