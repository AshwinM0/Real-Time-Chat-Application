import request from "supertest";
import { io as ioClient } from "socket.io-client";

let n = 0;

// Signs up a user through the real endpoint and returns their id and login cookie.
export async function signUp(server, name) {
  const username = `${name}_${process.pid}_${++n}`;
  const res = await request(server.url).post("/api/auth/signup").send({
    fullName: `Test ${name}`, username, password: "secret123", confirmPassword: "secret123", gender: "male",
  });
  const cookie = res.headers["set-cookie"].find((c) => c.startsWith("jwt=")).split(";")[0];
  return { id: res.body._id, username, fullName: res.body.fullName, cookie };
}

const openSockets = new Set();

export function connectSocket(server, user, opts = {}) {
  const socket = ioClient(server.url, {
    extraHeaders: user?.cookie ? { Cookie: user.cookie } : {},
    reconnection: false,
    forceNew: true, // never share a connection between two "tabs"
    ...opts,
  });
  openSockets.add(socket);

  // Attach the outcome listeners immediately, before the connection can complete.
  // Attaching them later can miss the event and hang the test.
  socket.ready = new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
  // Every onlineUsers list this socket has received, in order.
  socket.onlineHistory = [];
  socket.on("onlineUsers", (ids) => socket.onlineHistory.push(ids));
  return socket;
}

// Resolves with the nth onlineUsers list (1-based) this socket received.
// The server broadcasts once per connect and once per disconnect, so in a test
// that does one thing at a time, n says exactly which change to look at.
export function nthOnlineUsers(socket, n) {
  return new Promise((resolve) => {
    const check = () => {
      if (socket.onlineHistory.length < n) return;
      socket.off("onlineUsers", check);
      resolve(socket.onlineHistory[n - 1]);
    };
    socket.on("onlineUsers", check);
    check();
  });
}

// Resolves once the latest onlineUsers list this socket received passes the check.
export function onlineUsersMatching(socket, check) {
  return new Promise((resolve) => {
    const test = () => {
      const latest = socket.onlineHistory.at(-1);
      if (!latest || !check(latest)) return;
      socket.off("onlineUsers", test);
      resolve(latest);
    };
    socket.on("onlineUsers", test);
    test();
  });
}

// Closes every socket a test opened and waits until the server has seen them all
// go, so the next test starts with nobody online.
export async function closeAllSockets(server) {
  for (const socket of openSockets) socket.close();
  openSockets.clear();
  while (server.io.of("/").sockets.size > 0) {
    await new Promise((r) => setTimeout(r, 10));
  }
}
