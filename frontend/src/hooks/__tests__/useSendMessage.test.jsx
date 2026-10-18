import { act } from "@testing-library/react";
import toast from "react-hot-toast";
import useSendMessage from "../useSendMessage";
import useConversation from "../../zustand/useConversation";
import { useAuthContext } from "../../context/AuthContext";
import { renderHookWithProviders } from "../../../test/renderWithProviders";
import { jsonResponse } from "../../../test/http";

const sent = { _id: "m1", senderId: "me", receiverId: "u2", message: "hi" };

beforeEach(() => useConversation.getState().setSelectedConversation({ _id: "u2" }));

test("FU-17: a message the socket delivered before the HTTP response appears once", async () => {
  let respond;
  fetch.mockReturnValueOnce(new Promise((resolve) => { respond = resolve; }));
  const { result } = renderHookWithProviders(() => useSendMessage());

  let sending;
  act(() => { sending = result.current.sendMessage("hi"); });
  expect(result.current.loading).toBe(true);
  // The socket's copy lands while the request is still in flight...
  act(() => useConversation.getState().addMessage(sent));
  // ...then the response brings the same message again.
  await act(async () => { respond(jsonResponse(sent, 201)); await sending; });

  expect(useConversation.getState().messages).toEqual([sent]);
  expect(result.current.loading).toBe(false);
  expect(fetch).toHaveBeenCalledWith(
    "http://api.test/api/messages/send/u2",
    expect.objectContaining({ method: "POST", credentials: "include", body: JSON.stringify({ message: "hi" }) }),
  );
});

test("a 401 expires the session", async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ error: "Unauthorized" }, 401));
  const { result } = renderHookWithProviders(() => ({ ...useSendMessage(), auth: useAuthContext() }));

  await act(() => result.current.sendMessage("hi"));

  expect(result.current.auth.authUser).toBeNull();
  expect(useConversation.getState().messages).toEqual([]);
});

test("other errors show a toast and add nothing", async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ error: "Internal Server Error" }, 500));
  const { result } = renderHookWithProviders(() => useSendMessage());

  await act(() => result.current.sendMessage("hi"));

  expect(toast.error).toHaveBeenCalledWith("Internal Server Error");
  expect(useConversation.getState().messages).toEqual([]);
});
