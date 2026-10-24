import { act, renderHook } from "@testing-library/react";
import toast from "react-hot-toast";
import { AuthContextProvider, useAuthContext } from "../AuthContext";
import { ME, seedUser } from "../../../test/renderWithProviders";

const renderAuth = () => renderHook(() => useAuthContext(), { wrapper: AuthContextProvider });

describe("FU-36: AuthContext", () => {
  test("starts from the user saved in localStorage", () => {
    seedUser(ME);
    expect(renderAuth().result.current.authUser).toEqual(ME);
  });

  test("starts logged out when nothing is saved", () => {
    expect(renderAuth().result.current.authUser).toBeNull();
  });

  test("expireSession clears storage and state, with one toast however often it runs", () => {
    seedUser(ME);
    const { result } = renderAuth();

    // Several requests failing at once each call it. The fixed toast id is what
    // makes react-hot-toast show a single toast for all of them.
    act(() => {
      result.current.expireSession();
      result.current.expireSession();
    });

    expect(result.current.authUser).toBeNull();
    expect(localStorage.getItem("chat-user")).toBeNull();
    expect(toast.error).toHaveBeenCalledTimes(2);
    for (const [message, options] of toast.error.mock.calls) {
      expect(message).toBe("Your session has expired. Please log in again.");
      expect(options).toEqual({ id: "session-expired" });
    }
  });
});

describe("FU-51: AuthContext follows logins and logouts in other tabs", () => {
  // The browser fires "storage" in every other tab when one tab changes localStorage.
  const otherTabSets = (newValue) =>
    window.dispatchEvent(new StorageEvent("storage", { key: "chat-user", newValue }));

  test("logging out in another tab logs this tab out, without a session-expired toast", () => {
    seedUser(ME);
    const { result } = renderAuth();

    act(() => otherTabSets(null));

    expect(result.current.authUser).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  test("logging in as someone else in another tab switches this tab to them", () => {
    seedUser(ME);
    const { result } = renderAuth();
    const other = { ...ME, _id: "other", fullName: "Bo Other" };

    act(() => otherTabSets(JSON.stringify(other)));

    expect(result.current.authUser).toEqual(other);
  });

  test("changes to other localStorage keys are ignored", () => {
    seedUser(ME);
    const { result } = renderAuth();

    act(() => window.dispatchEvent(new StorageEvent("storage", { key: "something-else", newValue: null })));

    expect(result.current.authUser).toEqual(ME);
  });
});
