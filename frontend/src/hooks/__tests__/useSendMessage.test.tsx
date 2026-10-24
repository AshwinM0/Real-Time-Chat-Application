import { act } from "@testing-library/react";
import toast from "react-hot-toast";
import useSendMessage from "../useSendMessage";
import useConversation from "../../zustand/useConversation";
import { useAuthContext } from "../../context/AuthContext";
import { renderHookWithProviders } from "../../../test/renderWithProviders";
import { jsonResponse } from "../../../test/http";

const sent = { _id: "m1", senderId: "me", receiverId: "u2", message: "hi", createdAt: "2026-01-02T09:05:00.000Z" };

beforeEach(() => useConversation.getState().setSelectedConversation({ _id: "u2" } as any));

test("FU-17: a message the socket delivered before the HTTP response appears once", async () => {
  let respond: any;
  jest.mocked(fetch).mockReturnValueOnce(new Promise((resolve) => { respond = resolve; }));
  const { result } = renderHookWithProviders(() => useSendMessage());

  let sending: any;
  act(() => { sending = result.current.sendMessage("hi"); });
  expect(result.current.loading).toBe(true);
  // The socket's copy lands while the request is still in flight...
  act(() => useConversation.getState().addMessage(sent));
  // ...then the response brings the same message again.
  await act(async () => { respond(jsonResponse(sent, 201)); await sending; });

  expect(useConversation.getState().messages).toEqual([sent]);
  expect(result.current.loading).toBe(false);
  await expect(sending).resolves.toBe(true);
  expect(fetch).toHaveBeenCalledWith(
    "http://api.test/api/messages/send/u2",
    expect.objectContaining({ method: "POST", credentials: "include", body: JSON.stringify({ message: "hi" }) }),
  );
});

test("a 401 expires the session", async () => {
  jest.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: "Unauthorized" }, 401));
  const { result } = renderHookWithProviders(() => ({ ...useSendMessage(), auth: useAuthContext() }));

  await act(() => result.current.sendMessage("hi"));

  expect(result.current.auth.authUser).toBeNull();
  expect(useConversation.getState().messages).toEqual([]);
});

test("other errors show a toast and add nothing", async () => {
  jest.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: "Internal Server Error" }, 500));
  const { result } = renderHookWithProviders(() => useSendMessage());

  await act(() => result.current.sendMessage("hi"));

  expect(toast.error).toHaveBeenCalledWith("Internal Server Error");
  expect(useConversation.getState().messages).toEqual([]);
});

test("FU-66: sending too fast (429) shows when to try again, adds nothing, and reports it unsent", async () => {
  jest.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: "Too many messages, try again in 8 seconds" }, 429));
  const { result } = renderHookWithProviders(() => useSendMessage());

  let wasSent: any;
  await act(async () => { wasSent = await result.current.sendMessage("hi"); });

  expect(toast.error).toHaveBeenCalledWith("Too many messages, try again in 8 seconds", { id: "rate-limit" });
  expect(useConversation.getState().messages).toEqual([]);
  expect(wasSent).toBeFalsy();
});
