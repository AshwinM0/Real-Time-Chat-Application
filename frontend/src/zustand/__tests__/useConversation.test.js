import useConversation from "../useConversation";

const store = () => useConversation.getState();
const BOB = { _id: "bob" };
const fromBob = (id, text = "hi") => ({ _id: id, senderId: "bob", receiverId: "me", message: text });

describe("addMessage", () => {
  test("FU-1: appends a message for the open chat", () => {
    store().setSelectedConversation(BOB);
    store().addMessage(fromBob("m1"));
    expect(store().messages).toEqual([fromBob("m1")]);
  });

  test("FU-2: keeps a message only once, even if it arrives twice", () => {
    store().setSelectedConversation(BOB);
    store().addMessage(fromBob("m1"));
    store().addMessage(fromBob("m1"));
    expect(store().messages).toHaveLength(1);
  });

  test("FU-3: ignores a message for another chat, without changing state", () => {
    store().setSelectedConversation({ _id: "carol" });
    const before = useConversation.getState();
    store().addMessage(fromBob("m1"));
    // The same state object means Zustand doesn't re-render anything.
    expect(useConversation.getState()).toBe(before);
  });
});

describe("FU-53: mergeMessages", () => {
  const at = (id, second) => ({ ...fromBob(id), createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString() });

  test("adds a page in time order, around what's already shown, skipping duplicates", () => {
    store().setSelectedConversation(BOB);
    store().mergeMessages("bob", [at("m3", 3), at("m4", 4)]); // the newest page
    store().addMessage(at("m5", 5)); // a live message
    store().mergeMessages("bob", [at("m1", 1), at("m2", 2), at("m3", 3)]); // an older page, overlapping

    expect(store().messages.map((m) => m._id)).toEqual(["m1", "m2", "m3", "m4", "m5"]);
  });

  test("messages saved in the same millisecond are ordered by id", () => {
    store().setSelectedConversation(BOB);
    store().mergeMessages("bob", [at("m2", 1), at("m1", 1)]);
    expect(store().messages.map((m) => m._id)).toEqual(["m1", "m2"]);
  });

  test("a page for a chat that's no longer open is dropped, without changing state", () => {
    store().setSelectedConversation({ _id: "carol" });
    const before = useConversation.getState();
    store().mergeMessages("bob", [at("m1", 1)]);
    expect(useConversation.getState()).toBe(before);
  });

  test("opening another chat empties the list; reopening the same chat keeps it", () => {
    store().setSelectedConversation(BOB);
    store().mergeMessages("bob", [at("m1", 1)]);

    store().setSelectedConversation(BOB);
    expect(store().messages).toHaveLength(1);

    store().setSelectedConversation({ _id: "carol" });
    expect(store().messages).toEqual([]);
  });
});

describe("unread counts", () => {
  test("FU-4: counts each unread message", () => {
    store().incrementUnread("bob");
    store().incrementUnread("bob");
    expect(store().unread).toEqual({ bob: 2 });
  });

  test("FU-5: opening that chat clears its count; closing all chats doesn't", () => {
    store().incrementUnread("bob");
    store().setSelectedConversation(null);
    expect(store().unread.bob).toBe(1);

    store().setSelectedConversation(BOB);
    expect(store().unread.bob).toBe(0);
  });
});
