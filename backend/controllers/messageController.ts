import type { Request, RequestHandler } from 'express'
import type { ParamsDictionary } from 'express-serve-static-core'
import type { FilterQuery, SortOrder } from 'mongoose'
import { loggedInUser } from '../middleware/protectRoute.ts'
import Conversation from '../models/conversationModel.ts'
import Message, { type MessageDocument } from '../models/messageModel.ts'
import { getIO, type MessageSender } from '../socket/socket.ts'
import type { ErrorBody } from '../types.ts'
import { errorMessage } from '../utils/errorMessage.ts'
import { ChatParams, invalid, SendMessageBody } from '../validation.ts'

export const sendMessage: RequestHandler<ChatParams, MessageDocument | ErrorBody> = async (req, res) => {

    try {
        const params = ChatParams.safeParse(req.params)
        if(!params.success) return res.status(400).json(invalid(params.error))
        const input = SendMessageBody.safeParse(req.body)
        if(!input.success) return res.status(400).json(invalid(input.error))

        const {message} = input.data
        const {id: receiverId} = params.data
        const user = loggedInUser(req)
        const senderId = user._id

        // Find the pair's conversation, or create it, in one atomic step. A separate
        // findOne + create let two simultaneous first messages create two conversations.
        const conversation = await Conversation.findOneAndUpdate(
            { participantsKey : Conversation.keyFor(senderId, receiverId) },
            // Only applied when this call creates the conversation
            { $setOnInsert : { participants : [senderId, receiverId] } },
            { upsert : true, new : true }
        )

        // The message points to its conversation, so sending costs the same at
        // message 10 or message 10 million.
        const newMessage = await Message.create({
            conversationId : conversation._id,
            senderId,
            receiverId,
            message
        })

        // Push the saved message to everyone who should see it live.
        // Rooms are named after user ids (see socket/socket.ts), so:
        //  - receiverId reaches every tab the receiver has open
        //  - senderId reaches the sender's *other* tabs, keeping them in sync
        //    (the tab that sent it also gets it, and its store drops the duplicate)
        // If neither is connected, nobody receives it. That's fine: the message is
        // already in MongoDB and loads the next time the chat is opened.
        // The second argument rides along so the receiver can name the sender in a toast.
        const sender: MessageSender = { fullName: user.fullName, profilePic: user.profilePic }
        getIO().to([receiverId, senderId.toString()]).emit("newMessage", newMessage, sender)

        res.status(201).json(newMessage)

    } catch(e) {
        console.log("Error from message Controller sendMessage " + errorMessage(e))
        res.status(500).json({error : "Internal Server Error"})
    }
}


// Messages per page when the client doesn't say, and the most it can ask for.
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

// One query parameter, as Express parses it: a string, unless the client repeats
// the name (an array) or writes it like a[b] (an object). Only strings are valid here.
type QueryValue = Request["query"][string]

// A position in a chat: one message's createdAt plus its _id, which breaks ties
// between messages saved in the same millisecond. null if either part is malformed.
const parseCursor = (createdAt: QueryValue, id: QueryValue) => {
    if(typeof createdAt !== "string" || typeof id !== "string") return null
    const date = new Date(createdAt)
    if(Number.isNaN(date.getTime()) || !/^[0-9a-f]{24}$/i.test(id)) return null
    return { date, id }
}

// One page of a chat, as MongoDB is asked for it.
interface Page {
    limit: number
    filter: FilterQuery<MessageDocument>
    sort: { createdAt: SortOrder, _id: SortOrder }
}

// Reads which page GET /api/messages/:id asks for. A page is `limit` messages:
//   no cursor              the newest messages, for when a chat opens
//   ?before=&beforeId=     the ones just before that message, as the user scrolls back
//   ?after=&afterId=       the ones just after it, to catch up after a reconnect
// Returns the MongoDB filter and sort, or { error } for a malformed request.
const readPage = (query: Request["query"]): Page | ErrorBody => {
    const requested = typeof query.limit === "string" ? parseInt(query.limit, 10) : NaN
    const limit = Math.min(Math.max(requested || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
    const newestFirst = { createdAt : -1, _id : -1 } as const

    if(query.before !== undefined && query.after !== undefined) {
        return { error : "Use either before or after, not both" }
    }
    if(query.before !== undefined) {
        const cursor = parseCursor(query.before, query.beforeId)
        if(!cursor) return { error : "Invalid before cursor" }
        // Earlier than the cursor: an earlier time, or the same time and a smaller id.
        // The $lte on its own lets MongoDB start the index scan right at the cursor.
        const filter = { createdAt : { $lte : cursor.date }, $or : [ { createdAt : { $lt : cursor.date } }, { _id : { $lt : cursor.id } } ] }
        return { limit, filter, sort : newestFirst }
    }
    if(query.after !== undefined) {
        const cursor = parseCursor(query.after, query.afterId)
        if(!cursor) return { error : "Invalid after cursor" }
        const filter = { createdAt : { $gte : cursor.date }, $or : [ { createdAt : { $gt : cursor.date } }, { _id : { $gt : cursor.id } } ] }
        return { limit, filter, sort : { createdAt : 1, _id : 1 } }
    }
    return { limit, filter : {}, sort : newestFirst }
}

export const getMessages: RequestHandler<ChatParams, MessageDocument[] | ErrorBody> = async (req, res) => {
    try {

        const params = ChatParams.safeParse(req.params)
        if(!params.success) return res.status(400).json(invalid(params.error))

        const {id : usertoChatId} = params.data
        const senderId = loggedInUser(req)._id

        const page = readPage(req.query)
        if("error" in page) {
            return res.status(400).json({error : page.error})
        }

        const conversation = await Conversation.findOne({
            participantsKey : Conversation.keyFor(senderId, usertoChatId)
        }).select("_id")

        if(!conversation) {
            return res.status(200).json([])
        }

        // The { conversationId, createdAt, _id } index serves this directly, so it
        // reads one page however long the chat is.
        const messages = await Message.find({ conversationId : conversation._id, ...page.filter })
            .sort(page.sort)
            .limit(page.limit)

        // Always oldest first, the order the chat shows them in.
        if(page.sort.createdAt === -1) messages.reverse()

        res.status(200).json(messages)

    } catch(e) {
        console.log("Error from message Controller getMessages " + errorMessage(e))
        res.status(500).json({error : "Internal Server Error"})
    }
}


// POST /api/messages/:id/read: the caller has the chat with :id open, so every
// message in it so far is read. The frontend calls this once the chat's messages
// have loaded, and again whenever a new message from the other user appears in it.
export const markRead: RequestHandler<ChatParams, ErrorBody> = async (req, res) => {
    try {
        const params = ChatParams.safeParse(req.params)
        if(!params.success) return res.status(400).json(invalid(params.error))

        const me = loggedInUser(req)._id.toString()

        await Conversation.updateOne(
            { participantsKey : Conversation.keyFor(me, params.data.id) },
            { $set : { [`lastReadAt.${me}`] : new Date() } }
        )

        res.status(204).end()

    } catch(e) {
        console.log("Error from message Controller markRead " + errorMessage(e))
        res.status(500).json({error : "Internal Server Error"})
    }
}


// Counting stops here, so a chat that was never opened costs no more than any
// other. The sidebar shows "99+" from 100.
const UNREAD_CAP = 100

// For each user with unread messages for the caller, by id: how many.
type UnreadCounts = Record<string, number>

// GET /api/messages/unread: for each of the caller's chats with unread messages,
// the other user's id and how many messages they sent since the caller last had
// that chat open. Coming from the server, the counts survive reloads and include
// messages that arrived while the caller was offline.
export const getUnreadCounts: RequestHandler<ParamsDictionary, UnreadCounts | ErrorBody> = async (req, res) => {
    try {
        const me = loggedInUser(req)._id

        const conversations = await Conversation.find({ participants : me })
            .select("participants lastReadAt")
            .lean()

        const counts: UnreadCounts = {}
        await Promise.all(conversations.map(async (conversation) => {
            const lastRead = conversation.lastReadAt?.[me.toString()]
            // Never opened: every message they sent counts.
            const count = await Message.countDocuments({
                conversationId : conversation._id,
                receiverId : me,
                ...(lastRead && { createdAt : { $gt : lastRead } }),
            }).limit(UNREAD_CAP)

            if(count > 0) {
                const other = conversation.participants.find((id) => !id.equals(me)) ?? me
                counts[other.toString()] = count
            }
        }))

        res.status(200).json(counts)

    } catch(e) {
        console.log("Error from message Controller getUnreadCounts " + errorMessage(e))
        res.status(500).json({error : "Internal Server Error"})
    }
}

