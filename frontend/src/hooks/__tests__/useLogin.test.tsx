import { act } from "@testing-library/react";
import toast from "react-hot-toast";
import useLogin from "../useLogin";
import { useAuthContext } from "../../context/AuthContext";
import { renderHookWithProviders } from "../../../test/renderWithProviders";
import { jsonResponse } from "../../../test/http";

const renderLogin = () =>
  renderHookWithProviders(() => ({ ...useLogin(), auth: useAuthContext() }), { user: null });

describe("FU-12: useLogin", () => {
  test("empty fields are caught before calling the server", async () => {
    const { result } = renderLogin();
    await act(() => result.current.login("", "secret1"));
    expect(toast.error).toHaveBeenCalledWith("Please fill in all the fields!");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("success saves the user to localStorage and the context", async () => {
    jest.mocked(fetch).mockResolvedValueOnce(jsonResponse({ _id: "u1", fullName: "Ann" }));
    const { result } = renderLogin();

    await act(() => result.current.login("ann", "secret1"));

    expect(fetch).toHaveBeenCalledWith(
      "http://api.test/api/auth/login",
      expect.objectContaining({ credentials: "include", body: JSON.stringify({ username: "ann", password: "secret1" }) }),
    );
    expect(JSON.parse(localStorage.getItem("chat-user")!)._id).toBe("u1");
    expect(result.current.auth.authUser?._id).toBe("u1");
  });

  test("a server error shows the server's message", async () => {
    jest.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: "Incorrect password" }, 400));
    const { result } = renderLogin();

    await act(() => result.current.login("ann", "wrong"));

    expect(toast.error).toHaveBeenCalledWith("Incorrect password");
    expect(result.current.auth.authUser).toBeNull();
  });
});

test("FU-64: too many failed logins (429) shows when to try again, and nobody is logged in", async () => {
  jest.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: "Too many login attempts, try again in 15 minutes" }, 429));
  const { result } = renderLogin();

  await act(() => result.current.login("ann", "secret1"));

  expect(toast.error).toHaveBeenCalledWith("Too many login attempts, try again in 15 minutes", { id: "rate-limit" });
  expect(result.current.auth.authUser).toBeNull();
  expect(result.current.loading).toBe(false);
});
