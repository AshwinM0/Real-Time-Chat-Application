import type { ReactElement, ReactNode } from "react";
import { render, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AuthContextProvider } from "../src/context/AuthContext";
import { SocketContextProvider } from "../src/context/SocketContext";
import type { User } from "../src/types";

export const ME: User = { _id: "me", fullName: "Ann Me", username: "ann", profilePic: "me.png" };

// AuthContextProvider reads the logged-in user from localStorage when it mounts,
// just like after a real login.
export const seedUser = (user: User | null) => {
  if (user) localStorage.setItem("chat-user", JSON.stringify(user));
};

// What Providers wraps, and the page to start on.
interface ProvidersProps {
  children: ReactNode;
  route?: string;
}

// Who is logged in (null for nobody), and the page to start on.
interface ProviderOptions {
  user?: User | null;
  route?: string;
}

export function Providers({ children, route = "/" }: ProvidersProps) {
  return (
    <MemoryRouter initialEntries={[route]}>
      <AuthContextProvider>
        <SocketContextProvider>{children}</SocketContextProvider>
      </AuthContextProvider>
    </MemoryRouter>
  );
}

// Pass user: null to start logged out.
export function renderWithProviders(ui: ReactElement, { user = ME, route = "/" }: ProviderOptions = {}) {
  seedUser(user);
  return render(ui, { wrapper: ({ children }) => <Providers route={route}>{children}</Providers> });
}

export function renderHookWithProviders<Result>(hook: () => Result, { user = ME }: Pick<ProviderOptions, "user"> = {}) {
  seedUser(user);
  return renderHook(hook, { wrapper: Providers });
}
