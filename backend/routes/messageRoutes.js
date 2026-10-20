import express from "express";
import { sendMessage, getMessages, markRead, getUnreadCounts } from '../controllers/messageController.js'
import protectRoute from "../middleware/protectRoute.js";

const router = express.Router()

// Before "/:id", which would otherwise take "unread" for a user id.
router.get("/unread", protectRoute, getUnreadCounts)

router.get("/:id", protectRoute, getMessages)

router.post("/send/:id", protectRoute, sendMessage)

router.post("/:id/read", protectRoute, markRead)


export default router;
