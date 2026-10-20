import RevokedToken from "../models/revokedTokenModel.js";

// Where revoked login tokens are remembered until they expire. The rest of the
// backend only uses these two functions (revokeToken.js and getUserFromToken.js),
// so moving this to Redis means changing only this file. In Redis they would be:
//   revoke:    SET revoked:<jti> 1 PXAT <expiresAt in ms>   (Redis deletes the key then)
//   isRevoked: EXISTS revoked:<jti>
// Any implementation must pass the tests in __tests__/integration/revokedTokenStore.test.js.
const revokedTokenStore = {
    // Remembers the token id until expiresAt (a Date), when the token stops working
    // anyway. Revoking the same id twice is harmless.
    revoke: async (jti, expiresAt) => {
        await RevokedToken.updateOne(
            { jti },
            { $setOnInsert: { expiresAt } },
            { upsert: true }
        );
    },

    // Resolves to true if the token id was revoked.
    isRevoked: async (jti) => Boolean(await RevokedToken.exists({ jti })),
};

export default revokedTokenStore;
