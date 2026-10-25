import { randomUUID } from "node:crypto";
import request from "supertest";
import mongoose from "mongoose";
import Conversation from "../../models/conversationModel.ts";
import Message from "../../models/messageModel.ts";
import { startTestServer, type TestServer } from "../../test/testServer.ts";
import { signUp, type TestUser } from "../../test/factories.ts";

let server: TestServer;
beforeAll(async () => { server = await startTestServer("messages_test"); });
afterEach(() => server.reset());
afterAll(() => server.close());

// Every call is a new message, unless the test passes an earlier one's clientMessageId.
const send = (from: TestUser, to: TestUser, message: string, clientMessageId = randomUUID()) =>
  request(server.url).post(`/api/messages/send/${to.id}`).set("Cookie", from.cookie).send({ message, clientMessageId });

describe("users", () => {
  test("BI-8: listing users needs a login cookie", async () => {
    await request(server.url).get("/api/users").expect(401);
  });

  test("BI-9: lists every user except the caller, without passwords", async () => {
    const [ann, bob, cat] = await Promise.all(["ann", "bob", "cat"].map((n) => signUp(server, n)));

    const res = await request(server.url).get("/api/users").set("Cookie", ann.cookie).expect(200);

    expect(res.body.map((u: any) => u._id).sort()).toEqual([bob.id, cat.id].sort());
    for (const u of res.body) expect(u).not.toHaveProperty("password");
  });
});

describe("messages", () => {
  test("BI-10: the first message creates one conversation between the two users", async () => {
    const [ann, bob] = await Promise.all([signUp(server, "ann"), signUp(server, "bob")]);

    const res = await send(ann, bob, "hi").expect(201);
    expect(res.body).toMatchObject({ message: "hi", senderId: ann.id, receiverId: bob.id });

    const conversations = await Conversation.find();
    expect(conversations).toHaveLength(1);
    expect(conversations[0].participants.map(String).sort()).toEqual([ann.id, bob.id].sort());
  });

  test("BI-11: later messages reuse the same conversation, in either direction", async () => {
    const [ann, bob] = await Promise.all([signUp(server, "ann"), signUp(server, "bob")]);

    await send(ann, bob, "hi").expect(201);
    await send(bob, ann, "hey").expect(201);

    const conversations = await Conversation.find();
    expect(conversations).toHaveLength(1);
    expect(await Message.countDocuments({ conversationId: conversations[0]._id })).toBe(2);
  });

  test("BI-31: two first messages sent at the same moment share one conversation", async () => {
    await Conversation.init(); // the unique index on participantsKey must exist first
    const [ann, bob] = await Promise.all([signUp(server, "ann"), signUp(server, "bob")]);

    // Both requests look for a conversation before either has created one.
    await Promise.all([send(ann, bob, "hi").expect(201), send(bob, ann, "hey").expect(201)]);

    const conversations = await Conversation.find();
    expect(conversations).toHaveLength(1);
    expect(await Message.countDocuments({ conversationId: conversations[0]._id })).toBe(2);
  });

  test("BI-12: fetching a chat returns messages from both sides, oldest first", async () => {
    const [ann, bob] = await Promise.all([signUp(server, "ann"), signUp(server, "bob")]);
    await send(ann, bob, "one").expect(201);
    await send(bob, ann, "two").expect(201);
    await send(ann, bob, "three").expect(201);

    const res = await request(server.url).get(`/api/messages/${bob.id}`).set("Cookie", ann.cookie).expect(200);

    expect(res.body.map((m: any) => m.message)).toEqual(["one", "two", "three"]);
  });

  test("BI-13: fetching a chat that has no conversation yet returns an empty list", async () => {
    const [ann, bob] = await Promise.all([signUp(server, "ann"), signUp(server, "bob")]);
    const res = await request(server.url).get(`/api/messages/${bob.id}`).set("Cookie", ann.cookie).expect(200);
    expect(res.body).toEqual([]);
  });

  test("BI-14: sending without a login cookie is a 401 and saves nothing", async () => {
    const bob = await signUp(server, "bob");
    await request(server.url).post(`/api/messages/send/${bob.id}`).send({ message: "hi" }).expect(401);
    expect(await Message.countDocuments()).toBe(0);
  });

  // Checked before anything else runs (backend/validation.ts), like BI-4.
  describe("BI-15: invalid input is a 400 that says what's wrong, and saves nothing", () => {
    test("empty message", async () => {
      const [ann, bob] = await Promise.all([signUp(server, "ann"), signUp(server, "bob")]);
      const res = await send(ann, bob, "").expect(400);
      expect(res.body).toEqual({ error: "Message is required" });
      expect(await Message.countDocuments()).toBe(0);
    });
    test("malformed receiver id", async () => {
      const ann = await signUp(server, "ann");
      const res = await request(server.url).post("/api/messages/send/not-an-id")
        .set("Cookie", ann.cookie).send({ message: "hi" }).expect(400);
      expect(res.body).toEqual({ error: "That isn't a valid user id" });
      expect(await Conversation.countDocuments()).toBe(0);
    });
    test("a message that isn't text, which used to be saved as one", async () => {
      const [ann, bob] = await Promise.all([signUp(server, "ann"), signUp(server, "bob")]);
      const res = await request(server.url).post(`/api/messages/send/${bob.id}`)
        .set("Cookie", ann.cookie).send({ message: 42 }).expect(400);
      expect(res.body).toEqual({ error: "Message must be text" });
      expect(await Message.countDocuments()).toBe(0);
    });
    test("a missing or malformed clientMessageId", async () => {
      const [ann, bob] = await Promise.all([signUp(server, "ann"), signUp(server, "bob")]);
      const post = (body: object) =>
        request(server.url).post(`/api/messages/send/${bob.id}`).set("Cookie", ann.cookie).send(body);

      expect((await post({ message: "hi" }).expect(400)).body).toEqual({ error: "clientMessageId is required" });
      expect((await post({ message: "hi", clientMessageId: "short" }).expect(400)).body)
        .toEqual({ error: "clientMessageId must be 16 to 64 letters, digits, - or _" });
      expect(await Message.countDocuments()).toBe(0);
    });
  });

  test("BI-71: loading or marking read a chat with a malformed user id is a 400, not a 500", async () => {
    const ann = await signUp(server, "ann");

    for (const res of [
      await request(server.url).get("/api/messages/not-an-id").set("Cookie", ann.cookie),
      await request(server.url).post("/api/messages/not-an-id/read").set("Cookie", ann.cookie),
    ]) {
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "That isn't a valid user id" });
    }
  });
});

// Saves `count` messages from one user to another straight into the database,
// a second apart (or all in the same millisecond), much faster than sending each.
// Returns their texts in time order: "m000", "m001", ...
const seedHistory = async (from: TestUser, to: TestUser, count: number, { sameTime = false } = {}) => {
  const conversation = await Conversation.findOneAndUpdate(
    { participantsKey: Conversation.keyFor(from.id, to.id) },
    { $setOnInsert: { participants: [from.id, to.id] } },
    { upsert: true, new: true },
  );
  const start = Date.now() - count * 1000;
  const docs = Array.from({ length: count }, (_, i) => ({
    conversationId: conversation._id,
    senderId: new mongoose.Types.ObjectId(from.id),
    receiverId: new mongoose.Types.ObjectId(to.id),
    message: `m${String(i).padStart(3, "0")}`,
    createdAt: new Date(sameTime ? start : start + i * 1000),
  }));
  await Message.collection.insertMany(docs);
  return docs.map((d) => d.message);
};

// Known issue #12: a send whose answer never arrived looks failed, so the user
// sends it again. The browser reuses the message's clientMessageId for that.
describe("a message sent again", () => {
  test("BI-72: a retry with the same clientMessageId gets the first message back, and saves nothing new", async () => {
    const [ann, bob] = await Promise.all([signUp(server, "ann"), signUp(server, "bob")]);
    const id = randomUUID();

    const first = await send(ann, bob, "hi", id).expect(201);
    const retry = await send(ann, bob, "hi", id).expect(201);

    expect(retry.body).toEqual(first.body);
    expect(await Message.countDocuments()).toBe(1);
  });

  test("BI-73: two sends with the same clientMessageId at the same moment save one message, and both get it", async () => {
    await Message.init(); // the unique index must exist first
    const [ann, bob] = await Promise.all([signUp(server, "ann"), signUp(server, "bob")]);
    const id = randomUUID();

    // Both insert before either has finished; the unique index lets one in.
    const [a, b] = await Promise.all([send(ann, bob, "hi", id).expect(201), send(ann, bob, "hi", id).expect(201)]);

    expect(a.body._id).toBe(b.body._id);
    expect(await Message.countDocuments()).toBe(1);
  });

  test("BI-74: the same clientMessageId for a different message is a 422, and saves nothing", async () => {
    const [ann, bob, cat] = await Promise.all(["ann", "bob", "cat"].map((n) => signUp(server, n)));
    const id = randomUUID();
    await send(ann, bob, "hi", id).expect(201);

    const otherText = await send(ann, bob, "something else", id).expect(422);
    const otherPerson = await send(ann, cat, "hi", id).expect(422);

    expect(otherText.body).toEqual({ error: "That clientMessageId was already used for a different message" });
    expect(otherPerson.body).toEqual(otherText.body);
    expect(await Message.countDocuments()).toBe(1);
  });

  test("BI-75: ids belong to their sender, so two users can use the same one", async () => {
    await Message.init();
    const [ann, bob] = await Promise.all([signUp(server, "ann"), signUp(server, "bob")]);
    const id = randomUUID();

    await send(ann, bob, "hi bob", id).expect(201);
    await send(bob, ann, "hi ann", id).expect(201);

    expect(await Message.countDocuments()).toBe(2);
  });

  test("BI-76: the index is unique per sender, and messages from before clientMessageId don't collide in it", async () => {
    await Message.init();
    expect(await Message.collection.indexes()).toContainEqual(expect.objectContaining({
      key: { senderId: 1, clientMessageId: 1 },
      unique: true,
      partialFilterExpression: { clientMessageId: { $exists: true } },
    }));

    // Older messages have no clientMessageId. A unique index that included them
    // would count each as null, and refuse a sender's second one.
    const [ann, bob] = await Promise.all([signUp(server, "ann"), signUp(server, "bob")]);
    await seedHistory(ann, bob, 3);
    expect(await Message.countDocuments({ clientMessageId: { $exists: false } })).toBe(3);
  });
});

describe("history pages", () => {
  const history = (user: TestUser, other: TestUser, query: Record<string, any> = {}) =>
    request(server.url).get(`/api/messages/${other.id}`).query(query).set("Cookie", user.cookie);

  // Pages back from the newest messages to the start of the chat, the way the app
  // does as the user scrolls up. Returns each page's texts, newest page first.
  const pageBackThroughAll = async (user: TestUser, other: TestUser, limit: number) => {
    const pages: string[][] = [];
    let query: Record<string, any> = { limit };
    for (;;) {
      const { body } = await history(user, other, query).expect(200);
      pages.push(body.map((m: any) => m.message));
      if (body.length < limit) return pages;
      query = { limit, before: body[0].createdAt, beforeId: body[0]._id };
    }
  };

  let ann: TestUser, bob: TestUser;
  beforeEach(async () => { [ann, bob] = await Promise.all([signUp(server, "ann"), signUp(server, "bob")]); });

  test("BI-38: a chat opens on its newest messages, and `before` pages back through the rest with no gaps or repeats", async () => {
    const all = await seedHistory(ann, bob, 7);

    const pages = await pageBackThroughAll(ann, bob, 3);

    expect(pages).toEqual([["m004", "m005", "m006"], ["m001", "m002", "m003"], ["m000"]]);
    expect(pages.reverse().flat()).toEqual(all);
  });

  test("BI-39: messages saved in the same millisecond still page with no gaps or repeats", async () => {
    const all = await seedHistory(ann, bob, 5, { sameTime: true });

    const pages = await pageBackThroughAll(ann, bob, 2);

    expect(pages.reverse().flat()).toEqual(all);
  });

  test("BI-40: `after` returns the messages after a given one, oldest first, to catch up after a reconnect", async () => {
    await seedHistory(ann, bob, 5);
    const { body: [, second] } = await history(ann, bob).expect(200);

    const res = await history(ann, bob, { after: second.createdAt, afterId: second._id, limit: 2 }).expect(200);

    expect(res.body.map((m: any) => m.message)).toEqual(["m002", "m003"]);
  });

  test("BI-41: a page is 50 messages unless the client asks for fewer, and never more than 100", async () => {
    await seedHistory(ann, bob, 120);

    expect((await history(ann, bob).expect(200)).body).toHaveLength(50);
    expect((await history(ann, bob, { limit: 10 }).expect(200)).body).toHaveLength(10);
    expect((await history(ann, bob, { limit: 1000 }).expect(200)).body).toHaveLength(100);
  });

  test("BI-42: a malformed cursor is a 400", async () => {
    const time = "2026-01-01T00:00:00.000Z";
    const id = "0123456789abcdef01234567";

    await history(ann, bob, { before: time }).expect(400); // no id
    await history(ann, bob, { before: "not a date", beforeId: id }).expect(400);
    await history(ann, bob, { before: time, beforeId: id, after: time, afterId: id }).expect(400);
  });

  test("BI-68: a cursor or limit given twice, which Express reads as a list, is malformed or ignored", async () => {
    await seedHistory(ann, bob, 60);
    const time = "2026-01-01T00:00:00.000Z";
    const id = "0123456789abcdef01234567";

    // ?before=a&before=b: a list of times isn't a position in the chat.
    await request(server.url).get(`/api/messages/${bob.id}?before=${time}&before=${time}&beforeId=${id}`)
      .set("Cookie", ann.cookie).expect(400);
    // A limit that isn't one number is no limit: the usual 50.
    const res = await request(server.url).get(`/api/messages/${bob.id}?limit=5&limit=6`).set("Cookie", ann.cookie).expect(200);
    expect(res.body).toHaveLength(50);
  });

  test("BI-43: each message stores its conversation, which keeps no list of messages, and history is indexed", async () => {
    await send(ann, bob, "hi").expect(201);

    const [conversation] = await Conversation.find().lean();
    const [message] = await Message.find();
    expect(message.conversationId.toString()).toBe(conversation._id.toString());
    expect(conversation).not.toHaveProperty("messages");
    await Message.init();
    expect(await Message.collection.indexes())
      .toContainEqual(expect.objectContaining({ key: { conversationId: 1, createdAt: -1, _id: -1 } }));
  });
});

describe("unread counts", () => {
  const unread = async (user: TestUser) =>
    (await request(server.url).get("/api/messages/unread").set("Cookie", user.cookie).expect(200)).body;
  const markRead = (user: TestUser, other: TestUser) =>
    request(server.url).post(`/api/messages/${other.id}/read`).set("Cookie", user.cookie).expect(204);

  test("BI-44: counts what each person sent since the chat was last opened, never your own messages", async () => {
    const [ann, bob, cat] = await Promise.all(["ann", "bob", "cat"].map((n) => signUp(server, n)));
    // Bob is nowhere near the app: nothing is pushed to him, but it's all saved.
    await send(ann, bob, "one").expect(201);
    await send(ann, bob, "two").expect(201);
    await send(cat, bob, "hey").expect(201);
    await send(bob, ann, "from bob").expect(201);

    expect(await unread(bob)).toEqual({ [ann.id]: 2, [cat.id]: 1 });
    expect(await unread(ann)).toEqual({ [bob.id]: 1 });

    await markRead(bob, ann);
    expect(await unread(bob)).toEqual({ [cat.id]: 1 });

    await send(ann, bob, "three").expect(201);
    expect(await unread(bob)).toEqual({ [ann.id]: 1, [cat.id]: 1 });
  });

  test("BI-45: counting stops at 100, and users' conversations are indexed", async () => {
    const [ann, bob] = await Promise.all([signUp(server, "ann"), signUp(server, "bob")]);
    await seedHistory(ann, bob, 120);

    expect(await unread(bob)).toEqual({ [ann.id]: 100 });
    expect(await Conversation.collection.indexes())
      .toContainEqual(expect.objectContaining({ key: { participants: 1 } }));
  });

  test("BI-46: both need a login cookie", async () => {
    const bob = await signUp(server, "bob");
    await request(server.url).get("/api/messages/unread").expect(401);
    await request(server.url).post(`/api/messages/${bob.id}/read`).expect(401);
  });
});
