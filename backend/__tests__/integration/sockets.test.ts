import { jest } from "@jest/globals";
import request from "supertest";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { Socket } from "socket.io-client";
import User from "../../models/userModel.ts";
import { startTestServer, type TestServer } from "../../test/testServer.ts";
import {
  signUp, connectSocket, nthOnlineUsers, onlineUsersMatching, closeAllSockets, type TestUser,
} from "../../test/factories.ts";

let server: TestServer;
beforeAll(async () => { server = await startTestServer("sockets_test"); });
afterEach(async () => {
  await closeAllSockets(server);
  await server.reset();
});
afterAll(() => server.close());

const send = (from: TestUser, to: TestUser, message: string) =>
  request(server.url).post(`/api/messages/send/${to.id}`).set("Cookie", from.cookie).send({ message });

// Start listening BEFORE triggering the event, so it can't slip past.
const nextMessage = (socket: Socket) =>
  new Promise<{ message: any; sender: any }>((resolve) => socket.once("newMessage", (message, sender) => resolve({ message, sender })));

describe("handshake authentication", () => {
  test("BI-20: connecting without a cookie is refused as Unauthorized", async () => {
    await expect(connectSocket(server, null).ready).rejects.toThrow("Unauthorized");
  });

  test("BI-21: a forged, expired or deleted-user cookie is refused as Unauthorized", async () => {
    const victim = await signUp(server, "victim");
    const { userId } = jwt.decode(victim.cookie.slice("jwt=".length)) as JwtPayload;

    const forged = jwt.sign({ userId }, "not-the-server-secret");
    const expired = jwt.sign({ userId, exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET!);
    for (const token of [forged, expired]) {
      await expect(connectSocket(server, { cookie: `jwt=${token}` }).ready).rejects.toThrow("Unauthorized");
    }

    await User.findByIdAndDelete(userId);
    await expect(connectSocket(server, victim).ready).rejects.toThrow("Unauthorized");
  });

  test("BI-22: a valid cookie connects over polling, then upgrades to WebSocket", async () => {
    const ann = await signUp(server, "ann");
    const socket = await connectSocket(server, ann).ready;

    const engine = socket.io.engine;
    if (engine.transport.name !== "websocket") {
      await new Promise((resolve) => engine.once("upgrade", resolve));
    }
    expect(engine.transport.name).toBe("websocket");
  });

  test("BI-23: a valid cookie connects straight over WebSocket", async () => {
    // Proves the cookie is read from the WebSocket upgrade request too.
    const ann = await signUp(server, "ann");
    const socket = await connectSocket(server, ann, { transports: ["websocket"] }).ready;
    expect(socket.connected).toBe(true);
  });
});

describe("logout", () => {
  test("BI-34: logging out disconnects every socket opened with that cookie, and only those", async () => {
    const [ann, bob] = await Promise.all([signUp(server, "ann"), signUp(server, "bob")]);
    const phoneLogin = await request(server.url).post("/api/auth/login")
      .send({ username: ann.username, password: "secret123" }).expect(200);
    const phone = { cookie: phoneLogin.get("Set-Cookie")!.find((c) => c.startsWith("jwt="))!.split(";")[0] };

    // Two tabs share the browser's cookie. The phone logged in separately.
    const [tab1, tab2, phoneSocket] = await Promise.all(
      [ann, ann, phone].map((user) => connectSocket(server, user).ready));
    const closed = (socket: Socket) => new Promise((resolve) => socket.once("disconnect", resolve));
    const tabsClosed = Promise.all([closed(tab1), closed(tab2)]);

    await request(server.url).post("/api/auth/logout").set("Cookie", ann.cookie).expect(200);

    // "io server disconnect" means the server closed them, so they won't reconnect.
    expect(await tabsClosed).toEqual(["io server disconnect", "io server disconnect"]);
    // The phone still receives messages.
    const delivered = nextMessage(phoneSocket);
    await send(bob, ann, "still there?").expect(201);
    expect((await delivered).message.message).toBe("still there?");
    // And the old cookie can't open a new socket.
    await expect(connectSocket(server, ann).ready).rejects.toThrow("Unauthorized");
  });
});

describe("presence", () => {
  test("BI-24: everyone online receives the full list", async () => {
    const users = await Promise.all(["ann", "bob", "cat"].map((n) => signUp(server, n)));
    const sockets = users.map((u) => connectSocket(server, u));
    await Promise.all(sockets.map((s) => s.ready));

    const ids = users.map((u) => u.id).sort();
    for (const socket of sockets) {
      const latest = await onlineUsersMatching(socket, (list) => list.length === 3);
      expect([...latest].sort()).toEqual(ids);
    }
  });

  test("BI-25 and BI-26: one user with two sockets is listed once, and stays online until both close", async () => {
    const [watcher, ann] = await Promise.all([signUp(server, "watcher"), signUp(server, "ann")]);

    // Each connect and disconnect produces exactly one broadcast, so the watcher's
    // nth list is the state right after the nth step.
    const w = connectSocket(server, watcher);
    await nthOnlineUsers(w, 1);                       // watcher's own connect

    const tab1 = connectSocket(server, ann);
    expect(await nthOnlineUsers(w, 2)).toContain(ann.id);

    const tab2 = connectSocket(server, ann);
    const afterSecondTab = await nthOnlineUsers(w, 3);
    expect(afterSecondTab.filter((id) => id === ann.id)).toHaveLength(1); // BI-25

    tab1.close();
    expect(await nthOnlineUsers(w, 4)).toContain(ann.id);    // one tab left: still online

    tab2.close();
    expect(await nthOnlineUsers(w, 5)).not.toContain(ann.id); // last tab gone: offline, and broadcast
  });
});

describe("message delivery", () => {
  test("BI-27 and BI-28: newMessage reaches the receiver and the sender's other tabs, nobody else", async () => {
    const [alice, bob, carol] = await Promise.all(["alice", "bob", "carol"].map((n) => signUp(server, n)));
    const [a1, a2, b1, c1] = [alice, alice, bob, carol].map((u) => connectSocket(server, u));
    await Promise.all([a1, a2, b1, c1].map((s) => s.ready));

    const [bobGot, a1Got, a2Got] = [b1, a1, a2].map(nextMessage);
    const carolGot = jest.fn();
    c1.on("newMessage", carolGot);

    await send(alice, bob, "hi bob").expect(201);

    const { message, sender } = await bobGot;
    // Ids arrive as strings: the payload is JSON on the wire.
    expect(message).toMatchObject({ message: "hi bob", senderId: alice.id, receiverId: bob.id });
    expect(typeof message._id).toBe("string");
    expect(sender.fullName).toBe(alice.fullName);
    await Promise.all([a1Got, a2Got]);

    // Proving that something did NOT happen needs a short wait.
    await new Promise((r) => setTimeout(r, 200));
    expect(carolGot).not.toHaveBeenCalled();
  });

  test("BI-29: a message to someone offline is still saved, and loads over REST later", async () => {
    const [alice, bob] = await Promise.all([signUp(server, "alice"), signUp(server, "bob")]);

    await send(alice, bob, "while you were out").expect(201);

    const res = await request(server.url).get(`/api/messages/${alice.id}`).set("Cookie", bob.cookie).expect(200);
    expect(res.body.map((m: any) => m.message)).toEqual(["while you were out"]);
  });
});
