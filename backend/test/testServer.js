import http from "node:http";
import mongoose from "mongoose";
import { createApp } from "../app.js";
import { initSocket } from "../socket/socket.js";

// A full backend (Express + Socket.IO + MongoDB) on a random free port.
// dbName keeps each test file in its own database on the shared in-memory server.
// redis: optional Redis clients, as connectRedis() returns them.
export async function startTestServer(dbName, { redis } = {}) {
  await mongoose.connect(process.env.MONGO_TEST_URI, { dbName });
  const httpServer = http.createServer(createApp({ redis }));
  const io = await initSocket(httpServer, { redis });
  await new Promise((resolve) => httpServer.listen(0, resolve)); // port 0 = any free port
  return {
    url: `http://localhost:${httpServer.address().port}`,
    io,
    // Empties every collection but keeps the indexes, such as the unique username.
    reset: () => Promise.all(
      Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})),
    ),
    close: async () => {
      io.close(); // also closes httpServer
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    },
  };
}
