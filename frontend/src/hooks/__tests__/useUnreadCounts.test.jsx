import { act, waitFor } from "@testing-library/react";
import toast from "react-hot-toast";
import useUnreadCounts from "../useUnreadCounts";
import useConversation from "../../zustand/useConversation";
import { useAuthContext } from "../../context/AuthContext";
import { lastSocket } from "../../../test/fakeSocket";
import { renderHookWithProviders } from "../../../test/renderWithProviders";
import { jsonResponse } from "../../../test/http";

const unread = () => useConversation.getState().unread;

describe("FU-61: useUnreadCounts", () => {
  test("loads the counts once when the app starts, and again after every reconnect", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ u2: 3 }));
    const { unmount } = renderHookWithProviders(() => useUnreadCounts());

    await waitFor(() => expect(unread()).toEqual({ u2: 3 }));
    // Once, even though the socket appeared after the first render.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("http://api.test/api/messages/unread", { credentials: "include" });

    // Messages that arrived while disconnected were never pushed: the server has them.
    fetch.mockResolvedValueOnce(jsonResponse({ u2: 5, u3: 1 }));
    const manager = lastSocket().io;
    await act(async () => manager.serverEmit("reconnect"));
    await waitFor(() => expect(unread()).toEqual({ u2: 5, u3: 1 }));

    unmount();
    expect(manager.listenerCount("reconnect")).toBe(0);
  });

  test("a 401 expires the session, and other errors show a toast", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ error: "Server down" }, 500));
    const { result } = renderHookWithProviders(() => { useUnreadCounts(); return useAuthContext(); });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Server down"));

    fetch.mockResolvedValueOnce(jsonResponse({ error: "Unauthorized" }, 401));
    await act(async () => lastSocket().io.serverEmit("reconnect"));
    await waitFor(() => expect(result.current.authUser).toBeNull());
  });
});
