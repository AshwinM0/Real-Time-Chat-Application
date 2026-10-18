import { act } from "@testing-library/react";
import toast from "react-hot-toast";
import useListenMessages from "../useListenMessages";
import useConversation from "../../zustand/useConversation";
import { lastSocket, serverEmit } from "../../../test/fakeSocket";
import { renderHookWithProviders } from "../../../test/renderWithProviders";

const BOB = { fullName: "Bob Ray", profilePic: "bob.png" };
const fromBob = (overrides) => ({ _id: "m1", senderId: "u2", receiverId: "me", message: "hi", ...overrides });
const store = () => useConversation.getState();

test("FU-18: a message for the open chat is appended, without a toast", () => {
  store().setSelectedConversation({ _id: "u2" });
  renderHookWithProviders(() => useListenMessages());

  act(() => serverEmit("newMessage", fromBob(), BOB));

  expect(store().messages).toEqual([fromBob()]);
  expect(toast).not.toHaveBeenCalled();
  expect(store().unread.u2).toBe(0);
});

test("FU-19: a message for a closed chat counts as unread and shows a toast, cut to 60 characters", () => {
  store().setSelectedConversation({ _id: "carol" });
  renderHookWithProviders(() => useListenMessages());
  const long = "x".repeat(80);

  act(() => serverEmit("newMessage", fromBob({ message: long }), BOB));

  expect(store().messages).toEqual([]);
  expect(store().unread.u2).toBe(1);
  expect(toast).toHaveBeenCalledWith(`Bob Ray: ${"x".repeat(60)}…`, expect.objectContaining({ icon: "💬" }));
});

test("FU-20: my own message, synced from another tab, never notifies", () => {
  renderHookWithProviders(() => useListenMessages());

  act(() => serverEmit("newMessage", fromBob({ senderId: "me", receiverId: "u3" }), { fullName: "Ann Me" }));

  expect(toast).not.toHaveBeenCalled();
  expect(store().unread).toEqual({});
});

test("FU-21: unmounting removes the same handler it added, so handlers never pile up", () => {
  const { unmount } = renderHookWithProviders(() => useListenMessages());
  const socket = lastSocket();
  const [, handler] = socket.on.mock.calls.find(([event]) => event === "newMessage");

  unmount();

  expect(socket.off).toHaveBeenCalledWith("newMessage", handler);
  expect(socket.listenerCount("newMessage")).toBe(0);
});
