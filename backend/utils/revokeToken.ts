import revokedTokenStore from "../stores/revokedTokenStore.ts";
import verifyToken from "./verifyToken.ts";

// Makes a login token stop working before it expires: getUserFromToken refuses
// any token whose id is in the revoked-token store. Clearing the cookie alone
// isn't enough, because a copy of the token would keep working for up to 15 days.
// Returns the token's id, or null if the token was missing or already invalid.
const revokeToken = async (token: string | undefined): Promise<string | null> => {
    const claims = token ? verifyToken(token) : null
    if(!claims) return null

    // Kept until the token's own expiry (exp is in seconds). After that it's useless.
    await revokedTokenStore.revoke(claims.jti, new Date(claims.exp * 1000))
    return claims.jti
}

export default revokeToken;
