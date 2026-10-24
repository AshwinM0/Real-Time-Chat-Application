import express from "express";
import { sendMessage, getMessages, markRead, getUnreadCounts } from '../controllers/messageController.js'
import protectRoute from "../middleware/protectRoute.js";

// limits: the rate limiters from createRateLimits().
const messageRoutes = ({ sendByUser }) => {
    const router = express.Router()

    // Before "/:id", which would otherwise take "unread" for a user id.
    router.get("/unread", protectRoute, getUnreadCounts)

    router.get("/:id", protectRoute, getMessages)

    // The limit is per user, so it goes after protectRoute, which sets req.user.
    router.post("/send/:id", protectRoute, sendByUser, sendMessage)

    router.post("/:id/read", protectRoute, markRead)

    return router
}


export default messageRoutes;
