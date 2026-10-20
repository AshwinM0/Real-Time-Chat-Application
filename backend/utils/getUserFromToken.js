import jwt from "jsonwebtoken";
import User from "../models/userModel.js";
import revokedTokenStore from "../stores/revokedTokenStore.js";

// Turns the value of the "jwt" cookie into a user.
// Shared by protectRoute (HTTP requests) and the Socket.IO handshake, so both
// decide "who is this?" in exactly the same way.
// Returns { user, jti } on success (jti is the token's id), or { error }
// explaining why the token was rejected.
const getUserFromToken = async (token) => {
    if(!token) return { error: "No Token Provided" }

    let decoded
    try {
        // Throws if the token is expired, malformed or signed with another secret.
        decoded = jwt.verify(token, process.env.JWT_SECRET)
    } catch {
        return { error: "Invalid Token" }
    }

    // Tokens from before logout could revoke them have no id. Nothing could revoke
    // them, so they're refused and their owners log in again once.
    if(!decoded.jti) return { error: "Invalid Token" }

    // Both lookups run at the same time, so the revocation check adds no wait.
    const [user, revoked] = await Promise.all([
        // A valid token can still point at a deleted user, e.g. after switching databases.
        User.findById(decoded.userId).select("-password"),
        // Logged out: the token is valid but must not work any more, even if copied.
        revokedTokenStore.isRevoked(decoded.jti),
    ])
    if(revoked) return { error: "Token revoked" }
    if(!user) return { error: "User not found" }

    return { user, jti: decoded.jti }
}

export default getUserFromToken;
