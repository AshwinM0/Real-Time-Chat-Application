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

        const newMessage = new Message({
            senderId,
            receiverId,
            message
        })

        if(newMessage) {
            conversation.messages.push(newMessage._id)
        }

        // run in parallel
        await Promise.all([conversation.save(), newMessage.save()])

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


export const getMessages = async (req, res) => {
    try {

        const {id : usertoChatId} = req.params
        const senderId = req.user._id

        const conversation = await Conversation.findOne({
            participantsKey : Conversation.keyFor(senderId, usertoChatId)
        }).populate("messages")

        if(!conversation) {
            return res.status(200).json([])
        }

        const messages = conversation.messages

        res.status(200).json(messages)

    } catch(e) {
        console.log("Error from message Controller getMessages " + e.message)
        res.status(500).json({error : "Internal Server Error"})
    }
}

