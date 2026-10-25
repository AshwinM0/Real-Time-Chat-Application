import mongoose, { type HydratedDocument, type InferSchemaType } from "mongoose";

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
    },
    // The id the sender's browser gave this message. Sending it again, after an
    // answer that never arrived, carries the same id, and the index below stops a
    // second copy (see sendMessage). Messages from before it existed have none.
    clientMessageId : {
        type : String
    }
}, {timestamps: true})

// A chat is read one page at a time, newest first (see getMessages). This index
// serves that directly, so a page costs the same however long the chat is.
// _id breaks ties between messages saved in the same millisecond.
messageSchema.index({ conversationId : 1, createdAt : -1, _id : -1 })

// One message per id per sender: two users may happen to pick the same id. Partial,
// because a unique index counts a missing field as null, so it couldn't be built
// once one sender had two messages from before clientMessageId.
messageSchema.index(
    { senderId : 1, clientMessageId : 1 },
    { unique : true, partialFilterExpression : { clientMessageId : { $exists : true } } }
)

// A message's fields, worked out from the schema above, and a message loaded from MongoDB.
export type MessageFields = InferSchemaType<typeof messageSchema>
export type MessageDocument = HydratedDocument<MessageFields>

const Message = mongoose.model("Message", messageSchema)

export default Message;
