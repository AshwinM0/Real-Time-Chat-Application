import { act } from "@testing-library/react";
import toast from "react-hot-toast";
import useSendMessage from "../useSendMessage";
import useConversation from "../../zustand/useConversation";
import { useAuthContext } from "../../context/AuthContext";
import { renderHookWithProviders } from "../../../test/renderWithProviders";
import { jsonResponse } from "../../../test/http";

const sent = { _id: "m1", senderId: "me", receiverId: "u2", message: "hi", createdAt: "2026-01-02T09:05:00.000Z" };

// The body of the nth request (1-based): the message and its clientMessageId.
const nthBody = (n: number) => JSON.parse(jest.mocked(fetch).mock.calls[n - 1][1]!.body as string);

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
    expect.objectContaining({ method: "POST", credentials: "include" }),
  );
  // 128 random bits as hex: the id the server uses to save the message only once.
  expect(nthBody(1)).toEqual({ message: "hi", clientMessageId: expect.stringMatching(/^[0-9a-f]{32}$/) });
});

test("FU-68: sending the same text to the same person after a failure reuses its id; anything else gets a new one", async () => {
  const { result } = renderHookWithProviders(() => useSendMessage());
  const sendAnswered = async (text: string, answer: Promise<any>) => {
    jest.mocked(fetch).mockReturnValueOnce(answer);
    await act(() => result.current.sendMessage(text));
  };
  const lost = () => Promise.reject(new TypeError("Failed to fetch"));

  // The answer never arrives, though the server may have saved it: the retry keeps the id.
  await sendAnswered("hi", lost());
  await sendAnswered("hi", lost());
  expect(nthBody(2).clientMessageId).toBe(nthBody(1).clientMessageId);

  // Edited text is a new message.
  await sendAnswered("hi there", Promise.resolve(jsonResponse({ ...sent, message: "hi there" }, 201)));
  expect(nthBody(3).clientMessageId).not.toBe(nthBody(1).clientMessageId);

  // Once one is sent, the same text again is a new message too.
  await sendAnswered("hi there", Promise.resolve(jsonResponse({ ...sent, _id: "m2", message: "hi there" }, 201)));
  expect(nthBody(4).clientMessageId).not.toBe(nthBody(3).clientMessageId);

  // So is the same text to someone else, after a failure.
  await sendAnswered("hello", lost());
  act(() => useConversation.getState().setSelectedConversation({ _id: "u3" } as any));
  await sendAnswered("hello", lost());
  expect(nthBody(6).clientMessageId).not.toBe(nthBody(5).clientMessageId);
  expect(jest.mocked(fetch).mock.calls[5][0]).toBe("http://api.test/api/messages/send/u3");
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
