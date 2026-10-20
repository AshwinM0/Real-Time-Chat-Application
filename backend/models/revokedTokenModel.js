import mongoose from "mongoose";

// Login tokens that were revoked before they expired, by their id (the JWT "jti").
// Only stores/revokedTokenStore.js uses this model. Logging out adds an entry, and
// getUserFromToken refuses any token listed here.
const revokedTokenSchema = new mongoose.Schema({
    jti : {
        type : String,
        required : true,
        unique : true
    },
    // When the token would have expired anyway. After that it's useless, so the
    // TTL index below has MongoDB delete the entry and the collection stays small.
    expiresAt : {
        type : Date,
        required : true
    }
})

revokedTokenSchema.index({ expiresAt : 1 }, { expireAfterSeconds : 0 })

const RevokedToken = mongoose.model("RevokedToken", revokedTokenSchema)

export default RevokedToken;
