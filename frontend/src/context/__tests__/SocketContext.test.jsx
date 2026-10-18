import { act } from "@testing-library/react";
import toast from "react-hot-toast";
import { io } from "socket.io-client";
import { useSocketContext } from "../SocketContext";
import { useAuthContext } from "../AuthContext";
import { lastSocket, serverEmit } from "../../../test/fakeSocket";
import { renderWithProviders, ME } from "../../../test/renderWithProviders";

// Renders nothing; just exposes both contexts to the test.
let socketCtx, authCtx;
const Probe = () => {
  socketCtx = useSocketContext();
  authCtx = useAuthContext();
  return null;
};

test("FU-30: no socket while logged out", () => {
  renderWithProviders(<Probe />, { user: null });
  expect(io).not.toHaveBeenCalled();
  expect(socketCtx.socket).toBeNull();
});

test("FU-31: logging in opens one socket to the API, with credentials", () => {
  renderWithProviders(<Probe />, { user: null });

  act(() => authCtx.setAuthUser(ME));

  expect(io).toHaveBeenCalledTimes(1);
  expect(io).toHaveBeenCalledWith("http://api.test", { withCredentials: true });
  expect(socketCtx.socket).toBe(lastSocket());
});

test("FU-32: the online list follows the server", () => {
  renderWithProviders(<Probe />);
  expect(socketCtx.onlineUsers).toEqual([]);

  act(() => serverEmit("onlineUsers", ["u2", "u3"]));

  expect(socketCtx.onlineUsers).toEqual(["u2", "u3"]);
});

test("FU-33: logging out closes the socket and empties the online list", () => {
  renderWithProviders(<Probe />);
  const socket = lastSocket();
  act(() => serverEmit("onlineUsers", ["u2"]));

  act(() => authCtx.setAuthUser(null));

  expect(socket.close).toHaveBeenCalled();
  expect(socketCtx.socket).toBeNull();
  expect(socketCtx.onlineUsers).toEqual([]);
});

test("FU-34: a refused handshake expires the session", () => {
  renderWithProviders(<Probe />);

  act(() => serverEmit("connect_error", new Error("Unauthorized")));

  expect(authCtx.authUser).toBeNull();
  expect(localStorage.getItem("chat-user")).toBeNull();
  expect(toast.error).toHaveBeenCalledWith(expect.any(String), { id: "session-expired" });
});

test("FU-35: a network error doesn't log you out (Socket.IO retries those itself)", () => {
  renderWithProviders(<Probe />);

  act(() => serverEmit("connect_error", new Error("xhr poll error")));

  expect(authCtx.authUser).toEqual(ME);
  expect(toast.error).not.toHaveBeenCalled();
});
