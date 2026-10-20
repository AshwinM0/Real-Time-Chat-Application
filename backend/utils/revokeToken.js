import jwt from "jsonwebtoken";
import revokedTokenStore from "../stores/revokedTokenStore.js";

// Makes a login token stop working before it expires: getUserFromToken refuses
// any token whose id is in the revoked-token store. Clearing the cookie alone
// isn't enough, because a copy of the token would keep working for up to 15 days.
// Returns the token's id, or null if the token was missing or already invalid.
const revokeToken = async (token) => {
    let decoded
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET)
    } catch {
        return null
    }
    if(!decoded.jti) return null

    // Kept until the token's own expiry (exp is in seconds). After that it's useless.
    await revokedTokenStore.revoke(decoded.jti, new Date(decoded.exp * 1000))
    return decoded.jti
}

export default revokeToken;
