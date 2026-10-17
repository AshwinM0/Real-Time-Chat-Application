import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

// Turns the value of the "jwt" cookie into a user.
// Shared by protectRoute (HTTP requests) and the Socket.IO handshake, so both
// decide "who is this?" in exactly the same way.
// Returns { user } on success, or { error } explaining why the token was rejected.
const getUserFromToken = async (token) => {
    if(!token) return { error: "No Token Provided" }

    let decoded
    try {
        // Throws if the token is expired, malformed or signed with another secret.
        decoded = jwt.verify(token, process.env.JWT_SECRET)
    } catch {
        return { error: "Invalid Token" }
    }

    // A valid token can still point at a deleted user, e.g. after switching databases.
    const user = await User.findById(decoded.userId).select("-password")
    if(!user) return { error: "User not found" }

    return { user }
}

export default getUserFromToken;
