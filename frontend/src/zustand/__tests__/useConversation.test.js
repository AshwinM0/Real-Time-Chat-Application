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
