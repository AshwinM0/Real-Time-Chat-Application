import { act, waitFor } from "@testing-library/react";
import toast from "react-hot-toast";
import useGetMessages from "../useGetMessages";
import useConversation from "../../zustand/useConversation";
import { useAuthContext } from "../../context/AuthContext";
import { lastSocket } from "../../../test/fakeSocket";
import { renderHookWithProviders } from "../../../test/renderWithProviders";
import { jsonResponse } from "../../../test/http";

const select = (_id) => useConversation.getState().setSelectedConversation({ _id });

test("FU-15: fetches the selected chat, and again when the selection changes", async () => {
  const history = [{ _id: "m1", senderId: "u2", receiverId: "me", message: "hi" }];
  fetch.mockResolvedValue(jsonResponse(history));
  select("u2");
  const { result } = renderHookWithProviders(() => useGetMessages());

  await waitFor(() => expect(result.current.messages).toEqual(history));
  expect(fetch).toHaveBeenCalledWith("http://api.test/api/messages/u2", { credentials: "include" });

  act(() => select("u3"));
  await waitFor(() => expect(fetch).toHaveBeenLastCalledWith("http://api.test/api/messages/u3", { credentials: "include" }));
  await waitFor(() => expect(result.current.loading).toBe(false));
});

test("FU-16: refetches when the socket reconnects, and stops listening on unmount", async () => {
  fetch.mockResolvedValue(jsonResponse([]));
  select("u2");
  const { result, unmount } = renderHookWithProviders(() => useGetMessages());
  const manager = lastSocket().io;
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(manager.listenerCount("reconnect")).toBe(1);
  fetch.mockClear();

  await act(async () => manager.serverEmit("reconnect"));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("http://api.test/api/messages/u2", { credentials: "include" });

  unmount();
  expect(manager.listenerCount("reconnect")).toBe(0);
});

test("does nothing until a chat is selected", () => {
  renderHookWithProviders(() => useGetMessages());
  expect(fetch).not.toHaveBeenCalled();
});

test("a 401 expires the session, and other errors show a toast", async () => {
  select("u2");
  fetch.mockResolvedValueOnce(jsonResponse({ error: "Server down" }, 500));
  const { result } = renderHookWithProviders(() => ({ ...useGetMessages(), auth: useAuthContext() }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Server down"));

  fetch.mockResolvedValue(jsonResponse({ error: "Unauthorized" }, 401));
  await act(async () => lastSocket().io.serverEmit("reconnect"));
  await waitFor(() => expect(result.current.auth.authUser).toBeNull());
});
