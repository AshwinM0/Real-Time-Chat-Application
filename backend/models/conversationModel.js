import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema( {
    participants : [
        {
            type : mongoose.Schema.Types.ObjectId,
            ref : 'User'
        }
    ],
    // There is deliberately no list of messages here: each message stores its
    // conversationId instead (see messageModel.js).
    // The two user ids, sorted (see keyFor below). The unique index is what stops
    // two conversations for the same pair when both users send a first message
    // at the same moment: MongoDB rejects the second one.
    participantsKey : {
        type : String,
        required : true,
        unique : true
    }
}, {timestamps: true})

// Sorting makes Alice→Bob and Bob→Alice produce the same key. Going through
// ObjectId normalises the ids, so an id typed in upper case can't produce a second key,
// and an invalid id throws.
conversationSchema.statics.keyFor = (userA, userB) =>
    [userA, userB].map((id) => new mongoose.Types.ObjectId(id).toString()).sort().join("_")

const Conversation = mongoose.model("Conversation", conversationSchema)

export default Conversation;