import jwt from "jsonwebtoken";

// What generateToken.ts puts in every login token: whose it is, the token's own
// id (jti), which logout uses to revoke it, and when it expires (exp, in seconds).
export interface TokenClaims {
    userId: string
    jti: string
    exp: number
}

// The secret that signs login tokens. It's read when it's needed, not when this
// file loads, so that server.ts can check it's set first and say so if it isn't.
export const jwtSecret = (): string => {
    const secret = process.env.JWT_SECRET
    if(!secret) throw new Error("JWT_SECRET is not set")
    return secret
}

// The token's claims if this server signed it and it hasn't expired, otherwise
// null. Shared by getUserFromToken and revokeToken, so both accept the same tokens.
const verifyToken = (token: string): TokenClaims | null => {
    let payload
    try {
        // Throws if the token is expired, malformed or signed with another secret.
        payload = jwt.verify(token, jwtSecret())
    } catch {
        return null
    }

    // Tokens from before logout could revoke them have no id. Nothing could revoke
    // them, so they're refused and their owners log in again once.
    if(typeof payload === "string" || typeof payload.userId !== "string" || !payload.jti || payload.exp === undefined) return null

    return { userId: payload.userId, jti: payload.jti, exp: payload.exp }
}

export default verifyToken;
