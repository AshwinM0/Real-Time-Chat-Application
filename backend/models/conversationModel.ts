import mongoose, { type Types } from "mongoose";

// A user id, as a string from a URL or an ObjectId from the database.
type UserId = string | Types.ObjectId

const conversationSchema = new mongoose.Schema( {
    participants : [
        {
            type : mongoose.Schema.Types.ObjectId,
            ref : 'User'
        }
    ],
    // There is deliberately no list of messages here: each message stores its
    // conversationId instead (see messageModel.ts).
    // The two user ids, sorted (see keyFor below). The unique index is what stops
    // two conversations for the same pair when both users send a first message
    // at the same moment: MongoDB rejects the second one.
    participantsKey : {
        type : String,
        required : true,
        unique : true
    },
    // When each participant last had this chat open, by user id. Messages sent to
    // them after that are unread (see getUnreadCounts), so unread counts survive
    // reloads and include messages that arrived while they were offline.
    lastReadAt : {
        type : Map,
        of : Date,
        default : {}
    }
}, {
    timestamps: true,
    // Declared here, rather than added to conversationSchema.statics afterwards, so
    // the model's type includes them.
    statics: {
        // Sorting makes Alice→Bob and Bob→Alice produce the same key. Going through
        // ObjectId normalises the ids, so an id typed in upper case can't produce a
        // second key, and an invalid id throws.
        keyFor: (userA: UserId, userB: UserId): string =>
            [userA, userB].map((id) => new mongoose.Types.ObjectId(id).toString()).sort().join("_"),
    },
})

// Finding a user's conversations, to count their unread messages.
conversationSchema.index({ participants : 1 })

const Conversation = mongoose.model("Conversation", conversationSchema)

export default Conversation;
