import { act } from "@testing-library/react";
import useMarkRead from "../useMarkRead";
import useConversation from "../../zustand/useConversation";
import { renderHookWithProviders } from "../../../test/renderWithProviders";
import { jsonResponse } from "../../../test/http";

const store = () => useConversation.getState();
const at = (second: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString();
const fromBob = (id: string, second: number) => ({ _id: id, senderId: "u2", receiverId: "me", message: "hi", createdAt: at(second) });
const fromMe = (id: string, second: number) => ({ _id: id, senderId: "me", receiverId: "u2", message: "hey", createdAt: at(second) });

const readRequests = () =>
  jest.mocked(fetch).mock.calls.filter(([url, options]) => String(url).endsWith("/read") && options?.method === "POST").map(([url]) => url);

beforeEach(() => jest.mocked(fetch).mockResolvedValue(jsonResponse(null, 204)));

describe("FU-62: useMarkRead", () => {
  test("marks the open chat read once its messages load, and again for each new message from them", () => {
    act(() => store().setSelectedConversation({ _id: "u2" } as any));
    renderHookWithProviders(() => useMarkRead());
    expect(readRequests()).toEqual([]); // nothing loaded yet

    act(() => store().mergeMessages("u2", [fromBob("m1", 1), fromMe("m2", 2)]));
    expect(readRequests()).toEqual(["http://api.test/api/messages/u2/read"]);

    act(() => store().addMessage(fromBob("m3", 3)));
    expect(readRequests()).toHaveLength(2);
  });

  test("my own messages and older pages don't count as new", () => {
    act(() => store().setSelectedConversation({ _id: "u2" } as any));
    act(() => store().mergeMessages("u2", [fromBob("m5", 5)]));
    renderHookWithProviders(() => useMarkRead());
    expect(readRequests()).toHaveLength(1);

    act(() => store().addMessage(fromMe("m6", 6)));
    act(() => store().mergeMessages("u2", [fromBob("m1", 1)])); // an older page
    expect(readRequests()).toHaveLength(1);
  });

  test("does nothing without an open chat", () => {
    renderHookWithProviders(() => useMarkRead());
    expect(readRequests()).toEqual([]);
  });
});
