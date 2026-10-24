import mongoose from "mongoose";
import RevokedToken from "../../models/revokedTokenModel.js";
import revokedTokenStore from "../../stores/revokedTokenStore.js";

// The contract every revoked-token store must meet. When the store moves to Redis,
// run BI-35 and BI-36 against the Redis version. BI-37 checks the MongoDB-specific
// cleanup; the Redis version gets the same from the key's expiry (PXAT).
beforeAll(() => mongoose.connect(process.env.MONGO_TEST_URI, { dbName: "revoked_tokens_test" }));
afterEach(() => RevokedToken.deleteMany({}));
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000);

describe("revoked token store", () => {
  test("BI-35: a revoked token id is reported as revoked, and no other is", async () => {
    await revokedTokenStore.revoke("token-1", inAnHour());

    expect(await revokedTokenStore.isRevoked("token-1")).toBe(true);
    expect(await revokedTokenStore.isRevoked("token-2")).toBe(false);
  });

  test("BI-36: revoking the same id twice is harmless", async () => {
    await revokedTokenStore.revoke("token-1", inAnHour());
    await revokedTokenStore.revoke("token-1", inAnHour());

    expect(await revokedTokenStore.isRevoked("token-1")).toBe(true);
  });

  test("BI-37: MongoDB deletes each entry once its token would have expired", async () => {
    // The TTL monitor only runs once a minute, so check the index rather than wait.
    await RevokedToken.init();
    const indexes = await RevokedToken.collection.indexes();
    expect(indexes).toContainEqual(expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 }));
  });
});
