import { act } from "@testing-library/react";
import toast from "react-hot-toast";
import useLogout from "../useLogout";
import { useAuthContext } from "../../context/AuthContext";
import { renderHookWithProviders } from "../../../test/renderWithProviders";
import { jsonResponse } from "../../../test/http";

const renderLogout = () => renderHookWithProviders(() => ({ ...useLogout(), auth: useAuthContext() }));

test("FU-13: logging out clears localStorage and the context", async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ message: "Logged out successfully" }));
  const { result } = renderLogout();
  expect(result.current.auth.authUser).not.toBeNull();

  await act(() => result.current.logout());

  expect(fetch).toHaveBeenCalledWith("http://api.test/api/auth/logout", expect.objectContaining({ method: "POST" }));
  expect(localStorage.getItem("chat-user")).toBeNull();
  expect(result.current.auth.authUser).toBeNull();
});

test("a failed logout keeps the user logged in and says why", async () => {
  fetch.mockRejectedValueOnce(new Error("Failed to fetch"));
  const { result } = renderLogout();

  await act(() => result.current.logout());

  expect(toast.error).toHaveBeenCalledWith("Failed to fetch");
  expect(result.current.auth.authUser).not.toBeNull();
});
