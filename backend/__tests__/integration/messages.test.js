import request from "supertest";
import mongoose from "mongoose";
import Conversation from "../../models/conversationModel.js";
import Message from "../../models/messageModel.js";
import { startTestServer } from "../../test/testServer.js";
import { signUp } from "../../test/factories.js";

let server;
beforeAll(async () => { server = await startTestServer("messages_test"); });
afterEach(() => server.reset());
afterAll(() => server.close());

const send = (from, to, message) =>
  request(server.url).post(`/api/messages/send/${to.id}`).set("Cookie", from.cookie).send({ message });

describe("users", () => {
  test("BI-8: listing users needs a login cookie", async () => {
    await request(server.url).get("/api/users").expect(401);
  });

  test("BI-9: lists every user except the caller, without passwords", async () => {
    const [ann, bob, cat] = await Promise.all(["ann", "bob", "cat"].map((n) => signUp(server, n)));

    const res = await request(server.url).get("/api/users").set("Cookie", ann.cookie).expect(200);

    expect(res.body.map((u) => u._id).sort()).toEqual([bob.id, cat.id].sort());
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

    expect(res.body.map((m) => m.message)).toEqual(["one", "two", "three"]);
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

  // Known gap, like BI-4: no input validation, so these are 500s today.
  describe("BI-15: invalid input should be a 400 (currently 500)", () => {
    test.failing("empty message", async () => {
      const [ann, bob] = await Promise.all([signUp(server, "ann"), signUp(server, "bob")]);
      await send(ann, bob, "").expect(400);
    });
    test.failing("malformed receiver id", async () => {
      const ann = await signUp(server, "ann");
      await request(server.url).post("/api/messages/send/not-an-id")
        .set("Cookie", ann.cookie).send({ message: "hi" }).expect(400);
    });
  });
});

describe("history pages", () => {
  // Saves `count` messages from one user to another straight into the database,
  // a second apart (or all in the same millisecond), much faster than sending each.
  // Returns their texts in time order: "m000", "m001", ...
  const seedHistory = async (from, to, count, { sameTime = false } = {}) => {
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

  const history = (user, other, query = {}) =>
    request(server.url).get(`/api/messages/${other.id}`).query(query).set("Cookie", user.cookie);

  // Pages back from the newest messages to the start of the chat, the way the app
  // does as the user scrolls up. Returns each page's texts, newest page first.
  const pageBackThroughAll = async (user, other, limit) => {
    const pages = [];
    let query = { limit };
    for (;;) {
      const { body } = await history(user, other, query).expect(200);
      pages.push(body.map((m) => m.message));
      if (body.length < limit) return pages;
      query = { limit, before: body[0].createdAt, beforeId: body[0]._id };
    }
  };

  let ann, bob;
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

    expect(res.body.map((m) => m.message)).toEqual(["m002", "m003"]);
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
