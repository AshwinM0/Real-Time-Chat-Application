import RevokedToken from "../models/revokedTokenModel.ts";

// Where revoked login tokens are remembered until they expire. The rest of the
// backend only uses these two functions (revokeToken.ts and getUserFromToken.ts),
// so moving this to Redis means changing only this file. In Redis they would be:
//   revoke:    SET revoked:<jti> 1 PXAT <expiresAt in ms>   (Redis deletes the key then)
//   isRevoked: EXISTS revoked:<jti>
// Any implementation must pass the tests in __tests__/integration/revokedTokenStore.test.ts.
export interface RevokedTokenStore {
    // Remembers the token id until expiresAt, when the token stops working anyway.
    // Revoking the same id twice is harmless.
    revoke(jti: string, expiresAt: Date): Promise<void>
    // Resolves to true if the token id was revoked.
    isRevoked(jti: string): Promise<boolean>
}

const revokedTokenStore: RevokedTokenStore = {
    revoke: async (jti, expiresAt) => {
        await RevokedToken.updateOne(
            { jti },
            { $setOnInsert: { expiresAt } },
            { upsert: true }
        );
    },

    isRevoked: async (jti) => Boolean(await RevokedToken.exists({ jti })),
};

export default revokedTokenStore;
