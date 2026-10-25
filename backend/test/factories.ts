import request from "supertest";
import { io as ioClient, type ManagerOptions, type Socket, type SocketOptions } from "socket.io-client";
import type { TestServer } from "./testServer.ts";

let n = 0;

// A user signed up through the API: what tests need to act as them.
export interface TestUser {
  id: string;
  username: string;
  fullName: string;
  cookie: string;
}

// Where a server under test listens.
export interface ServerAddress {
  url: string;
}

// Signs up a user through the real endpoint and returns their id and login cookie.
export async function signUp(server: ServerAddress, name: string): Promise<TestUser> {
  const username = `${name}_${process.pid}_${++n}`;
  const res = await request(server.url).post("/api/auth/signup").send({
    fullName: `Test ${name}`, username, password: "secret123", confirmPassword: "secret123", gender: "male",
  });
  const cookie = res.get("Set-Cookie")!.find((c) => c.startsWith("jwt="))!.split(";")[0]!;
  return { id: res.body._id, username, fullName: res.body.fullName, cookie };
}

const openSockets = new Set<Socket>();

// What connectSocket adds to a client socket: a promise that settles once it
// connects or is refused, and every onlineUsers list it has received, in order.
interface SocketTracking {
  ready: Promise<Socket>;
  onlineHistory: string[][];
}
export type TestSocket = Socket & SocketTracking;

// Who a socket connects as: their login cookie, if they have one.
export interface SocketUser {
  cookie?: string;
}

export function connectSocket(
  server: ServerAddress,
  user: SocketUser | null,
  opts: Partial<ManagerOptions & SocketOptions> = {},
): TestSocket {
  const socket = ioClient(server.url, {
    extraHeaders: user?.cookie ? { Cookie: user.cookie } : {},
    reconnection: false,
    forceNew: true, // never share a connection between two "tabs"
    ...opts,
  });
  openSockets.add(socket);

  // Attach the outcome listeners immediately, before the connection can complete.
  // Attaching them later can miss the event and hang the test.
  const ready = new Promise<Socket>((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
  const onlineHistory: string[][] = [];
  socket.on("onlineUsers", (ids: string[]) => onlineHistory.push(ids));
  return Object.assign(socket, { ready, onlineHistory });
}

// Resolves with the nth onlineUsers list (1-based) this socket received.
// The server broadcasts once per connect and once per disconnect, so in a test
// that does one thing at a time, n says exactly which change to look at.
export function nthOnlineUsers(socket: TestSocket, n: number): Promise<string[]> {
  return new Promise((resolve) => {
    const check = () => {
      if (socket.onlineHistory.length < n) return;
      socket.off("onlineUsers", check);
      resolve(socket.onlineHistory[n - 1]!);
    };
    socket.on("onlineUsers", check);
    check();
  });
}

// Resolves once the latest onlineUsers list this socket received passes the check.
export function onlineUsersMatching(socket: TestSocket, check: (ids: string[]) => boolean): Promise<string[]> {
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
export async function closeAllSockets(server: TestServer) {
  for (const socket of openSockets) socket.close();
  openSockets.clear();
  while (server.io.of("/").sockets.size > 0) {
    await new Promise((r) => setTimeout(r, 10));
  }
}
