import http from "node:http";
import type { AddressInfo } from "node:net";
import mongoose from "mongoose";
import { createApp } from "../app.ts";
import { initSocket } from "../socket/socket.ts";

// A full backend (Express + Socket.IO + MongoDB) on a random free port.
// dbName keeps each test file in its own database on the shared in-memory server.
// redis: optional Redis clients, as connectRedis() returns them, or a stand-in
// from fakeRedis.ts.
export async function startTestServer(dbName: string, { redis }: { redis?: any } = {}) {
  await mongoose.connect(process.env.MONGO_TEST_URI!, { dbName });
  const httpServer = http.createServer(createApp({ redis }));
  const io = await initSocket(httpServer, { redis });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve)); // port 0 = any free port
  return {
    url: `http://localhost:${(httpServer.address() as AddressInfo).port}`,
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

export type TestServer = Awaited<ReturnType<typeof startTestServer>>;
