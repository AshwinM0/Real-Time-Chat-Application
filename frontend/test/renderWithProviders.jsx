import { render, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthContextProvider } from "../src/context/AuthContext";
import { SocketContextProvider } from "../src/context/SocketContext";

export const ME = { _id: "me", fullName: "Ann Me", username: "ann", profilePic: "me.png" };

// AuthContextProvider reads the logged-in user from localStorage when it mounts,
// just like after a real login.
export const seedUser = (user) => {
  if (user) localStorage.setItem("chat-user", JSON.stringify(user));
};

export function Providers({ children, route = "/" }) {
  return (
    <MemoryRouter initialEntries={[route]}>
      <AuthContextProvider>
        <SocketContextProvider>{children}</SocketContextProvider>
      </AuthContextProvider>
    </MemoryRouter>
  );
}

// Pass user: null to start logged out.
export function renderWithProviders(ui, { user = ME, route = "/" } = {}) {
  seedUser(user);
  return render(ui, { wrapper: ({ children }) => <Providers route={route}>{children}</Providers> });
}

export function renderHookWithProviders(hook, { user = ME } = {}) {
  seedUser(user);
  return renderHook(hook, { wrapper: Providers });
}
