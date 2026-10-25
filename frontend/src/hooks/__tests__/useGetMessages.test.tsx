import { act, waitFor } from "@testing-library/react";
import toast from "react-hot-toast";
import useGetMessages, { PAGE_SIZE } from "../useGetMessages";
import useConversation from "../../zustand/useConversation";
import { useAuthContext } from "../../context/AuthContext";
import { lastSocket } from "../../../test/fakeSocket";
import { renderHookWithProviders } from "../../../test/renderWithProviders";
import { jsonResponse } from "../../../test/http";
import type { ChatMessage } from "../../types";

const select = (_id: string) => useConversation.getState().setSelectedConversation({ _id } as any);

// Message n in a chat with u2, n seconds into the day, so higher n is newer.
const msg = (n: number) => ({
  _id: `m${String(n).padStart(3, "0")}`, senderId: "u2", receiverId: "me", message: `#${n}`,
  createdAt: new Date(Date.UTC(2026, 0, 1) + n * 1000).toISOString(),
});
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => msg(from + i));
const ids = (messages: Pick<ChatMessage, "_id">[]) => messages.map((m) => m._id);

// The URL and query of the nth fetch (1-based).
const nthRequest = (n: number) => {
  const url = new URL(String(jest.mocked(fetch).mock.calls[n - 1][0]));
  return { path: url.pathname, query: Object.fromEntries(url.searchParams) };
};

// A fetch that answers only when the test calls respond(body).
const pendingFetch = () => {
  let respond: any;
  jest.mocked(fetch).mockReturnValueOnce(new Promise((resolve) => { respond = (body: any) => resolve(jsonResponse(body)); }));
  return (body: any) => respond(body);
};

test("FU-15: fetches the newest page of the selected chat, and again when the selection changes", async () => {
  const history = [msg(1)];
  jest.mocked(fetch).mockResolvedValue(jsonResponse(history));
  select("u2");
  const { result } = renderHookWithProviders(() => useGetMessages());

  await waitFor(() => expect(result.current.messages).toEqual(history));
  expect(fetch).toHaveBeenCalledWith("http://api.test/api/messages/u2?limit=50", { credentials: "include" });

  act(() => select("u3"));
  await waitFor(() => expect(fetch).toHaveBeenLastCalledWith("http://api.test/api/messages/u3?limit=50", { credentials: "include" }));
  await waitFor(() => expect(result.current.loading).toBe(false));
});

test("FU-16: reloads when the socket reconnects, and stops listening on unmount", async () => {
  jest.mocked(fetch).mockResolvedValue(jsonResponse([]));
  select("u2");
  const { result, unmount } = renderHookWithProviders(() => useGetMessages());
  const socket = lastSocket();
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(socket.io.listenerCount("reconnect")).toBe(1);
  jest.mocked(fetch).mockClear();

  // The chat was empty when the connection dropped, so it reloads the newest page.
  await act(async () => { socket.serverEmit("disconnect"); socket.io.serverEmit("reconnect"); });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("http://api.test/api/messages/u2?limit=50", { credentials: "include" });

  unmount();
  expect(socket.io.listenerCount("reconnect")).toBe(0);
  expect(socket.listenerCount("disconnect")).toBe(0);
});

test("does nothing until a chat is selected", () => {
  renderHookWithProviders(() => useGetMessages());
  expect(fetch).not.toHaveBeenCalled();
});

test("a 401 expires the session, and other errors show a toast", async () => {
  select("u2");
  jest.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: "Server down" }, 500));
  const { result } = renderHookWithProviders(() => ({ ...useGetMessages(), auth: useAuthContext() }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Server down"));

  jest.mocked(fetch).mockResolvedValue(jsonResponse({ error: "Unauthorized" }, 401));
  await act(async () => lastSocket().io.serverEmit("reconnect"));
  await waitFor(() => expect(result.current.auth.authUser).toBeNull());
});

test("FU-54: older pages load before the oldest message shown, until a short page says there are no more", async () => {
  jest.mocked(fetch).mockResolvedValueOnce(jsonResponse(range(11, 10 + PAGE_SIZE))); // a full page: maybe more
  select("u2");
  const { result } = renderHookWithProviders(() => useGetMessages());
  await waitFor(() => expect(result.current.hasOlder).toBe(true));

  jest.mocked(fetch).mockResolvedValueOnce(jsonResponse(range(1, 10))); // short: the start of the chat
  await act(() => result.current.loadOlder());

  expect(nthRequest(2)).toEqual({
    path: "/api/messages/u2",
    query: { limit: "50", before: msg(11).createdAt, beforeId: msg(11)._id },
  });
  expect(ids(result.current.messages)).toEqual(ids(range(1, 10 + PAGE_SIZE)));
  expect(result.current.hasOlder).toBe(false);
  expect(result.current.loadingOlder).toBe(false);
});

test("FU-55: only one older page loads at a time", async () => {
  jest.mocked(fetch).mockResolvedValueOnce(jsonResponse(range(11, 10 + PAGE_SIZE)));
  select("u2");
  const { result } = renderHookWithProviders(() => useGetMessages());
  await waitFor(() => expect(result.current.hasOlder).toBe(true));

  const respond = pendingFetch();
  let first: any;
  act(() => { first = result.current.loadOlder(); result.current.loadOlder(); });
  expect(result.current.loadingOlder).toBe(true);
  await act(async () => { respond(range(1, 10)); await first; });

  expect(fetch).toHaveBeenCalledTimes(2);
});

test("FU-56: after a reconnect, catches up from the newest message at the disconnect, keeping older pages", async () => {
  jest.mocked(fetch).mockResolvedValueOnce(jsonResponse([msg(1), msg(2)]));
  select("u2");
  const { result } = renderHookWithProviders(() => useGetMessages());
  await waitFor(() => expect(result.current.messages).toHaveLength(2));
  const socket = lastSocket();

  act(() => socket.serverEmit("disconnect"));
  // While disconnected, this tab sends #4 over HTTP. #3 arrived for us, unseen.
  act(() => useConversation.getState().addMessage({ ...msg(4), senderId: "me", receiverId: "u2" }));
  jest.mocked(fetch).mockResolvedValueOnce(jsonResponse([msg(3), { ...msg(4), senderId: "me", receiverId: "u2" }]));
  await act(async () => socket.io.serverEmit("reconnect"));

  // From #2, the newest at the disconnect, not #4: catching up from #4 would skip #3.
  expect(nthRequest(2).query).toEqual({ limit: "50", after: msg(2).createdAt, afterId: msg(2)._id });
  await waitFor(() => expect(ids(result.current.messages)).toEqual(ids(range(1, 4))));
});

test("FU-57: a long outage is caught up a page at a time", async () => {
  jest.mocked(fetch).mockResolvedValueOnce(jsonResponse([msg(1)]));
  select("u2");
  const { result } = renderHookWithProviders(() => useGetMessages());
  await waitFor(() => expect(result.current.messages).toHaveLength(1));
  const socket = lastSocket();

  act(() => socket.serverEmit("disconnect"));
  jest.mocked(fetch).mockResolvedValueOnce(jsonResponse(range(2, 1 + PAGE_SIZE))); // full: keep going
  jest.mocked(fetch).mockResolvedValueOnce(jsonResponse(range(2 + PAGE_SIZE, 4 + PAGE_SIZE)));
  await act(async () => socket.io.serverEmit("reconnect"));

  await waitFor(() => expect(result.current.messages).toHaveLength(4 + PAGE_SIZE));
  const last = msg(1 + PAGE_SIZE);
  expect(nthRequest(3).query).toEqual({ limit: "50", after: last.createdAt, afterId: last._id });
});

test("FU-58: a page that arrives after switching chats is dropped, and the new chat still finishes loading", async () => {
  select("u2");
  const respondU2 = pendingFetch();
  const { result } = renderHookWithProviders(() => useGetMessages());

  jest.mocked(fetch).mockResolvedValueOnce(jsonResponse([]));
  act(() => select("u3"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => respondU2([msg(1)]));

  expect(result.current.messages).toEqual([]);
  expect(result.current.loading).toBe(false);
});
