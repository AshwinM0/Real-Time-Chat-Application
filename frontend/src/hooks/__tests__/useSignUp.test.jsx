import { act } from "@testing-library/react";
import toast from "react-hot-toast";
import useSignUp from "../useSignUp";
import { useAuthContext } from "../../context/AuthContext";
import { renderHookWithProviders } from "../../../test/renderWithProviders";
import { jsonResponse } from "../../../test/http";

const valid = { fullName: "Ann", username: "ann", password: "secret1", confirmPassword: "secret1", gender: "female" };

const renderSignUp = () =>
  renderHookWithProviders(() => ({ ...useSignUp(), auth: useAuthContext() }), { user: null });

test.each([
  ["a missing field", { ...valid, gender: "" }, "Please fill in all the fields!"],
  ["mismatched passwords", { ...valid, confirmPassword: "other1" }, "Passwords do not match"],
  ["a password under 6 characters", { ...valid, password: "abc", confirmPassword: "abc" }, "Password must be at least 6 characters"],
])("FU-10: %s is caught before calling the server", async (_, input, message) => {
  const { result } = renderSignUp();
  await act(() => result.current.signup(input));
  expect(toast.error).toHaveBeenCalledWith(message);
  expect(fetch).not.toHaveBeenCalled();
});

test("FU-11: signup sends credentials so the browser keeps the login cookie", async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ _id: "u1", fullName: "Ann" }, 201));
  const { result } = renderSignUp();

  await act(() => result.current.signup(valid));

  expect(fetch).toHaveBeenCalledWith(
    "http://api.test/api/auth/signup",
    expect.objectContaining({ method: "POST", credentials: "include" }),
  );
  expect(JSON.parse(localStorage.getItem("chat-user"))._id).toBe("u1");
  expect(result.current.auth.authUser).toEqual({ _id: "u1", fullName: "Ann" });
});

test("a server error is shown, and nobody is logged in", async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ error: "Username already taken" }, 400));
  const { result } = renderSignUp();

  await act(() => result.current.signup(valid));

  expect(toast.error).toHaveBeenCalledWith("Username already taken");
  expect(result.current.auth.authUser).toBeNull();
  expect(result.current.loading).toBe(false);
});

test("FU-65: too many sign-ups (429) shows when to try again, and nobody is logged in", async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ error: "Too many sign-ups, try again in 60 minutes" }, 429));
  const { result } = renderSignUp();

  await act(() => result.current.signup(valid));

  expect(toast.error).toHaveBeenCalledWith("Too many sign-ups, try again in 60 minutes", { id: "rate-limit" });
  expect(result.current.auth.authUser).toBeNull();
  expect(localStorage.getItem("chat-user")).toBeNull();
});
