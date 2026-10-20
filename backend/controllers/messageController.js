import Conversation from '../models/conversationModel.js'
import Message from '../models/messageModel.js'
import { getIO } from '../socket/socket.js'

export const sendMessage = async (req, res) => {
    
    try {
        const {message} = req.body
        const {id: receiverId} = req.params
        const senderId = req.user._id

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
        // Rooms are named after user ids (see socket/socket.js), so:
        //  - receiverId reaches every tab the receiver has open
        //  - senderId reaches the sender's *other* tabs, keeping them in sync
        //    (the tab that sent it also gets it, and its store drops the duplicate)
        // If neither is connected, nobody receives it. That's fine: the message is
        // already in MongoDB and loads the next time the chat is opened.
        // The second argument rides along so the receiver can name the sender in a toast.
        const sender = { fullName: req.user.fullName, profilePic: req.user.profilePic }
        getIO().to([receiverId, senderId.toString()]).emit("newMessage", newMessage, sender)

        res.status(201).json(newMessage)

    } catch(e) {
        console.log("Error from message Controller sendMessage " + e.message)
        res.status(500).json({error : "Internal Server Error"})
    }
}


// Messages per page when the client doesn't say, and the most it can ask for.
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

// A position in a chat: one message's createdAt plus its _id, which breaks ties
// between messages saved in the same millisecond. null if either part is malformed.
const parseCursor = (createdAt, id) => {
    const date = new Date(createdAt)
    if(Number.isNaN(date.getTime()) || !/^[0-9a-f]{24}$/i.test(id ?? "")) return null
    return { date, id }
}

// Reads which page GET /api/messages/:id asks for. A page is `limit` messages:
//   no cursor              the newest messages, for when a chat opens
//   ?before=&beforeId=     the ones just before that message, as the user scrolls back
//   ?after=&afterId=       the ones just after it, to catch up after a reconnect
// Returns the MongoDB filter and sort, or { error } for a malformed request.
const readPage = (query) => {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
    const newestFirst = { createdAt : -1, _id : -1 }

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

export const getMessages = async (req, res) => {
    try {

        const {id : usertoChatId} = req.params
        const senderId = req.user._id

        const page = readPage(req.query)
        if(page.error) {
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
        console.log("Error from message Controller getMessages " + e.message)
        res.status(500).json({error : "Internal Server Error"})
    }
}

