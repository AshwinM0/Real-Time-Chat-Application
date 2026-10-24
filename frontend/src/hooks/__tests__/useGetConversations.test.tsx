import { waitFor } from "@testing-library/react";
import toast from "react-hot-toast";
import useGetConversations from "../useGetConversations";
import { useAuthContext } from "../../context/AuthContext";
import { renderHookWithProviders } from "../../../test/renderWithProviders";
import { jsonResponse } from "../../../test/http";

const renderConversations = () =>
  renderHookWithProviders(() => ({ ...useGetConversations(), auth: useAuthContext() }));

describe("FU-14: useGetConversations", () => {
  test("returns the user list", async () => {
    const users = [{ _id: "u2", fullName: "Bob" }];
    jest.mocked(fetch).mockResolvedValueOnce(jsonResponse(users));
    const { result } = renderConversations();

    await waitFor(() => expect(result.current.conversations).toEqual(users));
    expect(result.current.loading).toBe(false);
    expect(fetch).toHaveBeenCalledWith("http://api.test/api/users", { credentials: "include" });
  });

  test("a 401 expires the session: one toast, and back to logged out", async () => {
    jest.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: "Unauthorized - Invalid Token" }, 401));
    const { result } = renderConversations();

    await waitFor(() => expect(result.current.auth.authUser).toBeNull());
    expect(localStorage.getItem("chat-user")).toBeNull();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(expect.any(String), { id: "session-expired" });
  });

  test("any other error is shown as a toast", async () => {
    jest.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: "Internal Server Error" }, 500));
    const { result } = renderConversations();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Internal Server Error"));
    expect(result.current.conversations).toEqual([]);
    expect(result.current.auth.authUser).not.toBeNull();
  });
});
