import request from "supertest";
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
    expect(conversations[0].messages).toHaveLength(2);
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
