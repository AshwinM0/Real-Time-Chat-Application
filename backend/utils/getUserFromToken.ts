import User, { type PublicUser, type PublicUserFields } from "../models/userModel.ts";
import revokedTokenStore from "../stores/revokedTokenStore.ts";
import verifyToken from "./verifyToken.ts";

// A token that checked out: whose it is, and its id (jti).
export interface AcceptedToken {
    user: PublicUser
    jti: string
    error?: undefined
}

// A token that was refused, and why.
export interface RefusedToken {
    error: string
    user?: undefined
    jti?: undefined
}

// Who a login token belongs to, or why it was refused. Each names the other's fields
// as undefined, so a caller can destructure { user, error }, and checking one tells
// TypeScript about the other.
export type TokenCheck = AcceptedToken | RefusedToken

// Turns the value of the "jwt" cookie into a user.
// Shared by protectRoute (HTTP requests) and the Socket.IO handshake, so both
// decide "who is this?" in exactly the same way.
const getUserFromToken = async (token: string | undefined): Promise<TokenCheck> => {
    if(!token) return { error: "No Token Provided" }

    // Expired, malformed, signed with another secret, or from before tokens had ids.
    const claims = verifyToken(token)
    if(!claims) return { error: "Invalid Token" }

    // Both lookups run at the same time, so the revocation check adds no wait.
    const [user, revoked] = await Promise.all([
        // A valid token can still point at a deleted user, e.g. after switching databases.
        User.findById(claims.userId).select<PublicUserFields>("-password"),
        // Logged out: the token is valid but must not work any more, even if copied.
        revokedTokenStore.isRevoked(claims.jti),
    ])
    if(revoked) return { error: "Token revoked" }
    if(!user) return { error: "User not found" }

    return { user, jti: claims.jti }
}

export default getUserFromToken;
