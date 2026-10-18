import { MongoMemoryServer } from "mongodb-memory-server";

// Runs once, before any test file. One in-memory MongoDB serves the whole run;
// each test file connects to its own database on it.
export default async function globalSetup() {
  const mongod = await MongoMemoryServer.create();
  globalThis.__MONGOD__ = mongod;
  // Test workers are started after this runs, so they inherit the variable.
  process.env.MONGO_TEST_URI = mongod.getUri();
}
