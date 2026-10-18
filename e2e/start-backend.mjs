// Started by Playwright (see playwright.config.mjs): an in-memory MongoDB plus the
// real backend. The tests never touch Atlas, and the database disappears at exit.
import { MongoMemoryServer } from "mongodb-memory-server";

const mongod = await MongoMemoryServer.create();
// server.js calls dotenv.config(), which never overrides variables that are
// already set, so this wins over any MONGO_DB_URI in a developer's .env.
process.env.MONGO_DB_URI = mongod.getUri("chat_e2e");

const stop = async () => {
  await mongod.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await import("../backend/server.js");
