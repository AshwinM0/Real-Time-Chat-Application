import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    // Each message points to its conversation. Conversations used to keep an array
    // of their message ids instead, but that array grew forever, was read in full on
    // every send, and would hit MongoDB's 16 MB document limit at around 800,000 messages.
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref : "Conversation",
        required : true
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref : "User",
        required : true
    },
    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref : "User",
        required : true
    },
    message : {
        type : String,
        required : true
    }
}, {timestamps: true})

// A chat is read one page at a time, newest first (see getMessages). This index
// serves that directly, so a page costs the same however long the chat is.
// _id breaks ties between messages saved in the same millisecond.
messageSchema.index({ conversationId : 1, createdAt : -1, _id : -1 })

const Message = mongoose.model("Message", messageSchema)

export default Message;