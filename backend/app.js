import express from "express"
import cookieParser from "cookie-parser"
import cors from "cors"

import authRoutes from "./routes/authRoutes.js"
import messageRoutes from "./routes/messageRoutes.js"
import protectRoute from "./middleware/protectRoute.js"
import userRoutes from "./routes/userRoutes.js"

// Builds the Express app without connecting to MongoDB or listening on a port.
// server.js wires it to a real port; tests serve it on a random free one.
export const createApp = () => {
    const app = express()

    app.use(cookieParser())
    app.use(express.json())
    app.options(cors())


    var corsOptions = {
        origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
        credentials: true,
    }


    app.use("/api/auth", cors(corsOptions) , authRoutes)

    app.use("/api/messages", cors(corsOptions), protectRoute, messageRoutes)

    app.use('/api/users', cors(corsOptions), userRoutes)

    return app
}
