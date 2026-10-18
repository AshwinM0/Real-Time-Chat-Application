import http from "http"
import dotenv from "dotenv"

import { createApp } from "./app.js"
import connectToDB from "./db/connectToDB.js"
import { initSocket } from "./socket/socket.js"


dotenv.config()

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
