# CHAT: test plan

This plan covers three layers: the backend, the frontend, and the two together end to end. It uses Jest for everything that runs in Node and Playwright for everything that runs in a real browser. Nothing here is implemented yet.

---

## 1. Where things stand

There are no tests and no test tooling in the repo. Everything so far has been checked by hand, plus two throwaway scripts that exercised the socket backend and the Zustand store.

Every bug found so far sat at a boundary between pieces, not inside one:

| Bug | Boundary | Layer that would have caught it |
|---|---|---|
| Signup fetch missing `credentials: 'include'` | Browser cookie handling | Frontend unit test on fetch options, and an E2E signup journey |
| `protectRoute` answering 500 for bad tokens | HTTP status contract | Backend integration |
| Send hook writing a stale message list | React state over time | Frontend unit test on the store |
| Tailwind config using `require` in an ES module | Build tooling | E2E (the app would not render) |
| Four "No Token Provided" toasts on open | Frontend and backend auth state disagreeing | Playwright against a mocked API |

So the plan keeps the usual pyramid shape but puts more weight on integration and end-to-end tests than a logic-heavy app would. The app's own logic is thin. Most of the risk lives in cookies, CORS, sockets and state timing.

**A note on tools.** Vite projects usually use Vitest, because it shares Vite's config and needs no Babel. Jest works fine with a small Babel setup, and this plan uses Jest as requested. The cost is one Babel config and a few module mappings on the frontend.

---

## 2. Strategy at a glance

| Layer | Tools | Runs against | Proves | Target size | Speed |
|---|---|---|---|---|---|
| Backend unit | Jest (native ESM) | Functions with mocked dependencies | Auth logic branches | ~10 tests | Milliseconds |
| Backend integration | Jest, Supertest, socket.io-client, mongodb-memory-server | Real Express app, real Socket.IO, real MongoDB in memory | HTTP contracts, socket auth, delivery, presence | ~30 tests | Seconds |
| Frontend unit and component | Jest, React Testing Library, jsdom | Hooks, store, context and components with `fetch` and the socket mocked | UI logic and state rules | ~50 tests | Seconds |
| Frontend against a mocked API | Playwright with `page.route` | Real browser, Vite dev server, no backend | Error and edge states that are hard to produce for real | ~5 tests | Seconds |
| End to end | Playwright | Real browser, real backend, MongoDB in memory | User journeys, including two users chatting live | ~14 tests | Tens of seconds |

---

## 3. Prerequisites: make the code testable

These are small code changes. They should land first, in their own commit.

1. **Separate building the app from starting it.** `backend/server.js` builds the Express app, connects to MongoDB and listens, all on import. Move app construction into `backend/app.js`, which exports `createApp()`. `server.js` then only wires the app, the HTTP server and Socket.IO together and listens. Tests import `createApp()` and listen on a random free port.
2. **Give each socket server its own presence state.** Move the `userSockets` map inside `initSocket()`, so every server a test starts begins with an empty online list.
3. **Read addresses from the environment.**
   - Backend: read the allowed frontend origin from `CLIENT_ORIGIN`, defaulting to `http://localhost:3000`, in both the Express CORS options and the Socket.IO CORS options.
   - Frontend: put the API address in one module, `src/config.js`, and import it in all six hooks and the socket context.

   ```js
   // frontend/src/config.js
   export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
   ```

   Jest cannot run `import.meta`, so tests map this module to a stub. Playwright then runs its own backend and frontend on other ports without clashing with your dev servers.
4. **Delete the stray `mongoose` import in `signUp.jsx`.** Under Jest it would load the whole server library into the simulated browser.
5. **Give interactive elements accessible names.** Playwright and Testing Library find elements the way a user or screen reader does, by role and name. Today several controls have no name.

   | Element | Change |
   |---|---|
   | Logout icon | Make it a `<button>` with `aria-label="Log out"`. It is currently an icon with a click handler, so it cannot be reached with the keyboard either. |
   | Send button | Add `aria-label="Send message"` |
   | Each user in the sidebar | Render as a `<button>`, so its accessible name is the user's full name |
   | Online dot | Add visually hidden text such as "online", or `aria-label` on the avatar |
   | Unread badge | `aria-label="3 unread messages"` |
   | Message bubble | `data-testid="message"`. A test id is the fallback when no role fits. |

   These also improve accessibility for real users.
6. **Never depend on `.env` in tests.** CI has no `.env`. Test setup sets `JWT_SECRET`, `NODE_ENV=test`, `CLIENT_ORIGIN` and the database address itself.

---

## 4. Tooling setup

### 4.1 Backend: Jest in native ESM mode

The backend is written as ES modules (`"type": "module"`). Jest supports native ESM behind a Node flag, which avoids Babel on the backend entirely.

Root `package.json` additions:

```jsonc
"devDependencies": {
  "jest": "^30",
  "supertest": "^7",
  "mongodb-memory-server": "^11",
  "socket.io-client": "^4.8"
},
"scripts": {
  "test:backend": "node --experimental-vm-modules node_modules/jest/bin/jest.js --selectProjects backend",
  "test:frontend": "npm --prefix frontend test",
  "test:e2e": "playwright test",
  "test": "npm run test:backend && npm run test:frontend && npm run test:e2e"
},
"config": {
  "mongodbMemoryServer": { "version": "<match your Atlas cluster's MongoDB version>" }
}
```

Running Jest through `node` with the flag works the same on Windows and Linux, so no `cross-env` is needed.

`jest.config.mjs` at the root:

```js
export default {
  projects: [{
    displayName: "backend",
    testEnvironment: "node",
    testMatch: ["<rootDir>/backend/**/*.test.js"],
    transform: {},                                   // native ESM, no Babel
    globalSetup: "<rootDir>/backend/test/globalSetup.js",       // starts MongoDB in memory once
    globalTeardown: "<rootDir>/backend/test/globalTeardown.js", // stops it
    setupFiles: ["<rootDir>/backend/test/env.js"],              // JWT_SECRET, NODE_ENV, CLIENT_ORIGIN
  }],
  coverageThreshold: {
    "./backend/": { lines: 85, branches: 80 },
  },
};
```

Things to know about this mode:

- **Mocking an ES module is different from classic Jest.** `jest.mock()` does not work for native ESM. Use `jest.unstable_mockModule()` before a dynamic `await import()` of the module under test. Import `jest` itself from `@jest/globals`.
- **The first run downloads a MongoDB binary.** It's a large one-time download, cached afterwards. Pin the version in the config above to match Atlas, so tests run against the same server version as production.
- **Database isolation.** One in-memory MongoDB runs for the whole run. Each test file uses its own database name, and `afterEach` drops it.

Shared helpers in `backend/test/`:

```js
// testServer.js — a full backend (Express + Socket.IO + MongoDB) on a random port
import http from "node:http";
import mongoose from "mongoose";
import { createApp } from "../app.js";
import { initSocket } from "../socket/socket.js";

export async function startTestServer(dbName) {
  await mongoose.connect(process.env.MONGO_TEST_URI, { dbName });
  const httpServer = http.createServer(createApp());
  const io = initSocket(httpServer);
  await new Promise((resolve) => httpServer.listen(0, resolve)); // port 0 = any free port
  return {
    url: `http://localhost:${httpServer.address().port}`,
    reset: () => mongoose.connection.db.dropDatabase(),
    close: async () => { io.close(); await mongoose.disconnect(); }, // io.close() also closes httpServer
  };
}
```

```js
// factories.js
import request from "supertest";
import { io as ioClient } from "socket.io-client";

let n = 0;
export async function signUp(server, name) {
  const username = `${name}_${process.pid}_${++n}`;
  const res = await request(server.url).post("/api/auth/signup").send({
    fullName: `Test ${name}`, username, password: "secret123", confirmPassword: "secret123", gender: "male",
  });
  const cookie = res.headers["set-cookie"].find((c) => c.startsWith("jwt=")).split(";")[0];
  return { id: res.body._id, fullName: res.body.fullName, cookie };
}

export function connectSocket(server, user, opts = {}) {
  const socket = ioClient(server.url, {
    extraHeaders: user?.cookie ? { Cookie: user.cookie } : {},
    reconnection: false,
    ...opts,
  });
  // Attach the outcome listeners immediately, before the connection can complete.
  // Attaching them later can miss the event and hang the test.
  socket.ready = new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
  return socket;
}
```

### 4.2 Frontend: Jest with Babel and jsdom

The frontend also declares `"type": "module"`. Here Jest runs in its classic CommonJS mode, and `babel-jest` converts the ES modules and JSX on the fly. Vite's React plugin ignores Babel config files by default, so this config only affects Jest.

`frontend/package.json` additions:

```jsonc
"devDependencies": {
  "jest": "^30",
  "jest-environment-jsdom": "^30",
  "babel-jest": "^30",
  "@babel/core": "^7.29",
  "@babel/preset-env": "^7.29",
  "@babel/preset-react": "^7.29",
  "@testing-library/react": "^16",
  "@testing-library/jest-dom": "^7",
  "@testing-library/user-event": "^14",
  "identity-obj-proxy": "^3"
},
"scripts": { "test": "jest" }
```

Pin Babel to 7. Babel 8 is now the latest release, but parts of the Jest coverage tooling still expect 7.

```js
// frontend/babel.config.cjs  (.cjs because the package is "type": "module")
module.exports = {
  presets: [
    ["@babel/preset-env", { targets: { node: "current" } }],
    ["@babel/preset-react", { runtime: "automatic" }],
  ],
};
```

```js
// frontend/jest.config.cjs
module.exports = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/test/setup.js"],
  moduleNameMapper: {
    "\\.(css)$": "identity-obj-proxy",
    "\\.(png|svg)$": "<rootDir>/test/fileStub.js",
    "^(\\.{1,2}/)+config(\\.js)?$": "<rootDir>/test/config.stub.js", // replaces import.meta.env
  },
  coverageThreshold: {
    "./src/hooks/": { lines: 85 },
    "./src/zustand/": { lines: 95 },
    "./src/context/": { lines: 85 },
    "./src/components/": { lines: 70 },
  },
};
```

Shared helpers in `frontend/test/`:

- **`setup.js`** loads `@testing-library/jest-dom` matchers and resets the Zustand store before each test with `useConversation.setState(initialState, true)`. Zustand stores are module-level, so state would otherwise leak between tests. It also clears `localStorage` and replaces `global.fetch` with `jest.fn()`, because jsdom has no `fetch`.
- **`fakeSocket.js`** backs `jest.mock("socket.io-client")`. It returns a fake socket with `on`, `off`, `close` and an `io` manager stub. Its `serverEmit(event, ...args)` lets a test play the server, for example `serverEmit("onlineUsers", ["u2"])`.
- **`renderWithProviders.jsx`** wraps a component in `MemoryRouter`, `AuthContextProvider` seeded through `localStorage`, and `SocketContextProvider`.
- **Toasts:** `jest.mock("react-hot-toast")` so tests assert on `toast.error` calls instead of searching the DOM for toast text.

### 4.3 Playwright

Install it at the root with `npm i -D @playwright/test`, then download the browser with `npx playwright install chromium`.

```js
// playwright.config.mjs
import { defineConfig } from "@playwright/test";

const API = "http://localhost:5100";
const WEB = "http://localhost:3100";

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: WEB, trace: "on-first-retry", screenshot: "only-on-failure" },
  retries: process.env.CI ? 1 : 0,
  projects: [
    { name: "e2e", testDir: "e2e/tests" },     // real backend
    { name: "mocked", testDir: "e2e/mocked" }, // page.route() fakes the API
  ],
  webServer: [
    {
      command: "node e2e/start-backend.mjs", // MongoDB in memory + backend on 5100
      url: `${API}/socket.io/?EIO=4&transport=polling`,
      env: { PORT: "5100", CLIENT_ORIGIN: WEB, JWT_SECRET: "e2e-secret", NODE_ENV: "test" },
    },
    {
      command: "npm --prefix frontend run dev -- --port 3100 --strictPort",
      url: WEB,
      env: { VITE_API_URL: API },
    },
  ],
});
```

- **`e2e/start-backend.mjs`** starts `MongoMemoryServer`, puts its address in `MONGO_DB_URI`, then imports `backend/server.js`. The test ports, 5100 and 3100, never collide with your dev servers on 5000 and 3000. The tests never touch Atlas.
- **Vite reads `VITE_*` variables from the environment that starts it.** That's how the test frontend learns the test backend's address.
- **Isolation without resets.** Every test creates its own users with unique usernames, so tests never see each other's data and the database needs no cleanup between tests. It disappears when the run ends.

The key fixture creates one logged-in user per browser context. A Playwright browser context is like a separate browser profile, with its own cookies and `localStorage`. Two contexts means two people chatting.

```js
// e2e/fixtures.mjs
import { test as base, expect } from "@playwright/test";
const API = "http://localhost:5100";

export const test = base.extend({
  makeUser: async ({ browser }, use) => {
    const contexts = [];
    await use(async (name) => {
      const context = await browser.newContext();
      contexts.push(context);
      // context.request shares the context's cookie jar, so the jwt cookie from
      // signup is stored exactly where the page will use it.
      const res = await context.request.post(`${API}/api/auth/signup`, {
        data: {
          fullName: name,
          username: `${name.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          password: "secret123", confirmPassword: "secret123", gender: "female",
        },
      });
      const user = await res.json();
      await context.addInitScript((u) => localStorage.setItem("chat-user", JSON.stringify(u)), user);
      return {
        ...user,
        context,
        open: async () => { const page = await context.newPage(); await page.goto("/"); return page; },
      };
    });
    for (const c of contexts) await c.close();
  },
});
export { expect };
```

Create every user before opening any page. The sidebar fetches the user list once when it loads, and a user who signs up later doesn't appear until a reload. That's a product gap; see section 7.

---

## 5. Test cases

### 5.1 Backend unit (Jest)

| ID | Target | Case | Expected |
|---|---|---|---|
| BU-1 | `getUserFromToken` | No token | `{ error: "No Token Provided" }`, no DB call |
| BU-2 | `getUserFromToken` | Malformed token | `{ error: "Invalid Token" }` |
| BU-3 | `getUserFromToken` | Token signed with another secret | `{ error: "Invalid Token" }` |
| BU-4 | `getUserFromToken` | Expired token | `{ error: "Invalid Token" }` |
| BU-5 | `getUserFromToken` | Valid token, `User.findById` returns null | `{ error: "User not found" }` |
| BU-6 | `getUserFromToken` | Valid token, user exists | `{ user }`, and the query excludes `password` |
| BU-7 | `protectRoute` | Helper returns an error | 401 with `"Unauthorized - " + reason`, `next` not called |
| BU-8 | `protectRoute` | Helper returns a user | `req.user` set, `next` called once |
| BU-9 | `protectRoute` | Helper throws | 500 |
| BU-10 | `generateTokenAndSetCookie` | Any user id | Cookie named `jwt`, `httpOnly`, 15-day `maxAge`, token decodes to that id |

### 5.2 Backend integration (Jest, Supertest, Socket.IO client, MongoDB in memory)

**Auth**

| ID | Case | Expected |
|---|---|---|
| BI-1 | Sign up with valid data | 201. Body has `_id`, `fullName`, `username`, `profilePic` and no password. `Set-Cookie` has an HttpOnly `jwt`. The stored password is a bcrypt hash. |
| BI-2 | Passwords don't match | 400 |
| BI-3 | Username already taken | 400 "Username already taken" |
| BI-4 | Missing field or invalid gender | Should be 400. **Currently 500.** Write it with `test.failing`, see section 7. |
| BI-5 | Log in with the right password | 200 and a `jwt` cookie |
| BI-6 | Unknown username, or wrong password | 400 with the matching message |
| BI-7 | Log out | `jwt` cookie cleared with `Max-Age=0` |

**Users and messages**

| ID | Case | Expected |
|---|---|---|
| BI-8 | `GET /api/users` without a cookie | 401 |
| BI-9 | `GET /api/users` with a cookie | Every user except the caller, no password fields |
| BI-10 | First message between two users | 201. One conversation created with both participants. |
| BI-11 | Second message between the same users | The same conversation is reused and now holds two message ids |
| BI-12 | `GET /api/messages/:id` | Messages in both directions, oldest first |
| BI-13 | `GET /api/messages/:id` with no conversation yet | `[]` |
| BI-14 | Send without a cookie | 401, nothing saved |
| BI-15 | Empty message, or malformed receiver id | Should be 400. **Currently 500.** Use `test.failing`. |
| BI-16 | CORS preflight from `CLIENT_ORIGIN` | `Access-Control-Allow-Origin` matches and `Allow-Credentials` is true |
| BI-17 | CORS preflight from another origin | No allow-origin header |

**Sockets.** These port the scratchpad script into the suite.

| ID | Case | Expected |
|---|---|---|
| BI-20 | Connect without a cookie | `connect_error` with message "Unauthorized" |
| BI-21 | Forged, expired, or deleted-user cookie | "Unauthorized" for each |
| BI-22 | Valid cookie, default transports | Connects, then upgrades to WebSocket |
| BI-23 | Valid cookie, `transports: ["websocket"]` | Connects. This proves the cookie middleware also runs on the upgrade path. |
| BI-24 | Three users connect | Each receives `onlineUsers` with all three ids |
| BI-25 | One user with two sockets | Listed once |
| BI-26 | That user closes one socket, then the other | Still online after the first. Gone after the second, and the update is broadcast. |
| BI-27 | A sends B a message over REST | B receives `newMessage` with the saved message and `sender.fullName`. Ids arrive as strings. |
| BI-28 | Same send | A's other sockets receive it too. An uninvolved user receives nothing. |
| BI-29 | B is offline when A sends | Still 201. B fetches the message later over REST. |
| BI-30 | Polling handshake from `CLIENT_ORIGIN` | Response allows that origin with credentials |

Example, BI-27 and BI-28:

```js
import { jest } from "@jest/globals";
import request from "supertest";
import { startTestServer } from "../../test/testServer.js";
import { signUp, connectSocket } from "../../test/factories.js";

let server;
beforeAll(async () => { server = await startTestServer("sockets_test"); });
afterEach(() => server.reset());
afterAll(() => server.close());

test("newMessage reaches the receiver and the sender's other tabs, nobody else", async () => {
  const [alice, bob, carol] = await Promise.all(["alice", "bob", "carol"].map((n) => signUp(server, n)));
  const [a1, a2, b1, c1] = [alice, alice, bob, carol].map((u) => connectSocket(server, u));
  await Promise.all([a1, a2, b1, c1].map((s) => s.ready));

  // Start listening BEFORE sending, so no event can slip past.
  const nextMessage = (s) => new Promise((resolve) => s.once("newMessage", (m, sender) => resolve({ m, sender })));
  const [bobGot, a1Got, a2Got] = [b1, a1, a2].map(nextMessage);
  const carolGot = jest.fn();
  c1.on("newMessage", carolGot);

  await request(server.url).post(`/api/messages/send/${bob.id}`)
    .set("Cookie", alice.cookie).send({ message: "hi bob" }).expect(201);

  const { m, sender } = await bobGot;
  expect(m).toMatchObject({ message: "hi bob", senderId: alice.id, receiverId: bob.id });
  expect(sender.fullName).toBe(alice.fullName);
  await Promise.all([a1Got, a2Got]);

  // Proving that something did NOT happen needs a short wait.
  await new Promise((r) => setTimeout(r, 200));
  expect(carolGot).not.toHaveBeenCalled();

  [a1, a2, b1, c1].forEach((s) => s.close());
});
```

### 5.3 Frontend unit and component (Jest, React Testing Library)

**Store and utilities**

| ID | Case | Expected |
|---|---|---|
| FU-1 | `addMessage` for the open chat | Appended |
| FU-2 | `addMessage` with the same `_id` twice | Kept once |
| FU-3 | `addMessage` for another chat | Ignored, and the same state object is returned |
| FU-4 | `incrementUnread` twice for one user | Count is 2 |
| FU-5 | Select that user's chat, or select `null` | Selecting clears the count. Selecting `null` keeps it. |
| FU-6 | `extractTime` | Pads to `HH:MM`, for example `09:05` |

**Hooks** (`renderHook` with providers, `fetch` mocked)

| ID | Hook | Case | Expected |
|---|---|---|---|
| FU-10 | `useSignUp` | Missing field, mismatched passwords, password under 6 characters | Error toast, `fetch` not called |
| FU-11 | `useSignUp` | Valid input | `fetch` called with `credentials: "include"`. This is the regression test for the cookie bug. The user is saved to `localStorage` and context. |
| FU-12 | `useLogin` | Empty fields, then success, then server error | No fetch, then user saved, then toast with the server's message |
| FU-13 | `useLogout` | Success | `localStorage` cleared, `authUser` null |
| FU-14 | `useGetConversations` | 200, then 401 | List returned. On 401: `expireSession` runs, one toast with id `session-expired`, `authUser` null. |
| FU-15 | `useGetMessages` | Selected chat changes | Fetches that chat |
| FU-16 | `useGetMessages` | Socket manager emits `reconnect` | Refetches. The handler is removed on unmount. |
| FU-17 | `useSendMessage` | Socket delivered the message before the HTTP response | Message appears once |
| FU-18 | `useListenMessages` | Message for the open chat | Appended, no toast |
| FU-19 | `useListenMessages` | Message from a user whose chat is closed | Unread +1. Toast shows the sender's name and the text cut to 60 characters. |
| FU-20 | `useListenMessages` | Own message synced from another tab | No toast, no unread |
| FU-21 | `useListenMessages` | Unmount | `socket.off` called with the same handler, so handlers never pile up |

**Contexts**

| ID | Case | Expected |
|---|---|---|
| FU-30 | `SocketContext` with no user | `io()` never called |
| FU-31 | User logs in | `io()` called once with the API address and `withCredentials: true` |
| FU-32 | Server emits `onlineUsers` | Context value updates |
| FU-33 | User logs out | `socket.close()` called, online list emptied |
| FU-34 | `connect_error` "Unauthorized" | `expireSession` runs |
| FU-35 | `connect_error` for a network error | No logout |
| FU-36 | `AuthContext` | Starts from `localStorage`. `expireSession` clears storage and state and shows one toast. |

**Components**

| ID | Component | Case | Expected |
|---|---|---|---|
| FU-40 | `App` | No user, or a user | `/` shows Login, or Home. `/login` with a user redirects to `/`. |
| FU-41 | `Login`, `SignUp` | Fill in and submit | Hook called with the values. Button disabled with a spinner while loading. |
| FU-42 | `GenderCheckbox` | Pick one, then the other | Only one checked |
| FU-43 | `Conversation` | Id in `onlineUsers` | Online indicator shown |
| FU-44 | `Conversation` | Unread count 0, then 3 | Badge hidden, then shows 3. Clicking selects the chat and clears it. |
| FU-45 | `Conversations` | Last item | No divider after it. **Currently fails** because of the `lastIdc` typo. Use `test.failing`. |
| FU-46 | `SearchInput` | Under 3 characters, a match, no match | Error toast. Selects the match and clears the input. "No such user found". |
| FU-47 | `Messages` | Loading, empty, populated | Skeletons, then the empty-state text, then bubbles |
| FU-48 | `Message` | From me, or from them | `chat-end` with blue bubble, or `chat-start` |
| FU-49 | `MessageContainer` | No chat selected, then chat with an online user | Welcome text with your name, then header with name and online indicator |
| FU-50 | `MessageInput` | Submit empty, then submit text | Nothing sent, then `sendMessage` called and the input cleared |

Example, FU-11:

```js
import { renderHook, act } from "@testing-library/react";
import useSignUp from "../useSignUp";
import { Providers } from "../../../test/renderWithProviders";

test("signup sends credentials so the browser keeps the login cookie", async () => {
  fetch.mockResolvedValueOnce({ status: 201, json: async () => ({ _id: "u1", fullName: "Ann" }) });
  const { result } = renderHook(() => useSignUp(), { wrapper: Providers });

  await act(() => result.current.signup({
    fullName: "Ann", username: "ann", password: "secret1", confirmPassword: "secret1", gender: "female",
  }));

  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/auth/signup"),
    expect.objectContaining({ credentials: "include" }),
  );
  expect(JSON.parse(localStorage.getItem("chat-user"))._id).toBe("u1");
});
```

### 5.4 Frontend against a mocked API (Playwright, `page.route`)

This layer runs the real app in a real browser and fakes the backend's answers. It's the cheapest way to produce states that are awkward to create for real.

| ID | Case | Expected |
|---|---|---|
| FM-1 | Saved user in `localStorage`, `/api/users` answers 401 | Login page and exactly one "session expired" toast. This is the regression test for the four-toast screenshot. |
| FM-2 | Login answers 400 "Incorrect password" | That text in a toast, still on the login page |
| FM-3 | `/api/users` answers 500 | Error toast, the page still renders |
| FM-4 | `/api/messages/:id` answers slowly | Skeletons first, then messages |
| FM-5 | All `/socket.io/` requests aborted | Sending still works and shows your own message. The app degrades to plain HTTP. |

Example, FM-1:

```js
import { test, expect } from "@playwright/test";

test("a stale saved user lands on login with a single toast", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("chat-user", JSON.stringify({ _id: "ghost", fullName: "Ghost" })));
  await page.route("**/api/users", (route) =>
    route.fulfill({ status: 401, json: { error: "Unauthorized - No Token Provided" } }));
  await page.route("**/socket.io/**", (route) => route.abort());

  await page.goto("/");

  await expect(page.getByRole("heading", { name: /Login/ })).toBeVisible();
  await expect(page.getByText("Your session has expired")).toHaveCount(1);
});
```

### 5.5 End to end (Playwright, real backend)

These automate the manual checklist in `docs/realtime-plan.md`. The last column maps each test to its checklist item.

| ID | Journey | Expected | Checklist |
|---|---|---|---|
| E2E-1 | Sign up through the form | Lands on Home, sidebar loads, no 401 toast. Still logged in after a reload. | 9 |
| E2E-2 | Log in and log out through the UI | After logout, a reload stays on the login page | |
| E2E-3 | Bob has Alice's chat open, Alice sends | Bob sees it without reloading | 1 |
| E2E-4 | Bob has Carol's chat open, Alice sends | Not in Carol's chat. Bob gets a toast and a badge of 1 on Alice. Opening Alice's chat shows the message and clears the badge. | 2 |
| E2E-5 | Bob has no chat open, Alice sends | Toast and badge | 3 |
| E2E-6 | Alice's context closes | Bob's dot for Alice disappears, and so does the "online" label in the chat header | 4 |
| E2E-7 | Alice has two pages in one context and closes one, then the other | Online after the first close, offline after the second | 5 |
| E2E-8 | Alice sends from page 1 of 2 | The message appears exactly once on both pages | 6 |
| E2E-9 | Alice logs out | Bob sees her go offline | 7 |
| E2E-10 | `context.clearCookies()`, then reload | Login page with a single toast | 8 |
| E2E-11 | Bob goes offline, Alice sends, Bob comes back | Bob's open chat shows the message after reconnecting. See the note below. | 10 |
| E2E-12 | Reload after a conversation | History still there, in order | |
| E2E-13 | Search 3+ characters of a name and press Enter | That chat opens | |
| E2E-14 | Very long message | Wraps inside the bubble. The toast preview is cut to 60 characters. | |

**About E2E-11.** It uses `context.setOffline(true)` and then `false`. Confirm early that this actually drops an open WebSocket in Chromium. If it doesn't, keep checklist item 10, restarting the backend, as a manual check rather than adding a test-only hook to production code.

Example, E2E-3:

```js
import { test, expect } from "../fixtures.mjs";

test("a message from Alice appears live in Bob's open chat", async ({ makeUser }) => {
  const alice = await makeUser("Alice");
  const bob = await makeUser("Bob");                 // create everyone first
  const [alicePage, bobPage] = await Promise.all([alice.open(), bob.open()]);

  await bobPage.getByRole("button", { name: "Alice" }).click();
  await alicePage.getByRole("button", { name: "Bob" }).click();
  await alicePage.getByPlaceholder("Send a Message").fill("hello bob");
  await alicePage.getByRole("button", { name: "Send message" }).click();

  // Web-first assertion: retries until it passes or times out. No sleeps.
  await expect(bobPage.getByTestId("message").filter({ hasText: "hello bob" })).toBeVisible();
});
```

---

## 6. Coverage targets and what to skip

| Area | Target |
|---|---|
| `backend/` overall | 85% of lines, 80% of branches |
| `getUserFromToken`, `protectRoute` | 100% of branches. These are the security boundary. |
| `backend/socket/` | 90% of lines |
| `frontend/src/zustand/` | 95% of lines |
| `frontend/src/hooks/`, `frontend/src/context/` | 85% of lines |
| `frontend/src/components/` | 70% of lines |
| Playwright | No line coverage. Target: every journey above, and every checklist item except possibly item 10. |

The Jest thresholds make a run fail when coverage drops. Coverage numbers are a floor, not a goal. A test that runs a line without asserting anything about it adds coverage but no protection.

Skip these:

- **Mongoose schema definitions**, which are declarations.
- **`connectToDB`**, which is a thin wrapper.
- **`main.jsx`**, which is wiring.
- **Skeleton markup.**
- **Tailwind and daisyUI styling.** Visual regression testing could come later if the UI starts changing often.

---

## 7. Known gaps the tests will document

Some current behaviour is wrong but out of scope for a testing pass. Write those tests with Jest's `test.failing`, or Playwright's `test.fail()`. The suite stays green while the bug exists. When someone fixes it, the test starts failing, which is the reminder to turn it into a normal test.

- **Missing input validation.** A missing field, an invalid gender, an empty message or a malformed id produces a 500 instead of a 400. Covered by BI-4 and BI-15.
- **The `lastIdc` typo.** It draws a divider after the last user. Covered by FU-45.

These are design limits to know about. They don't get tests:

- **New users don't appear in other users' sidebars until a reload.** A future `userJoined` socket event would fix this.
- **Unread counts live in memory** and reset on reload.
- **Message history isn't paginated.**

---

## 8. Rollout order

1. **Prerequisites** from section 3, in one small commit.
2. **Backend integration suite.** This is the highest value, because it protects login and every socket behaviour. Most of it is a port of the existing scratchpad script.
3. **E2E real-time journeys.** These replace the manual checklist.
4. **Frontend unit tests.** Store and hooks first, then the socket context, then components.
5. **The mocked-API Playwright layer.**
6. **Continuous integration.** A GitHub Actions workflow on every push and pull request runs three jobs: backend Jest, frontend Jest, and Playwright. Cache the MongoDB binary download and the Playwright browser between runs, and upload Playwright traces when a test fails.

### Files this plan adds

```
jest.config.mjs
playwright.config.mjs
backend/app.js                          (prerequisite: app built separately from listen)
backend/test/                           globalSetup.js, globalTeardown.js, env.js, testServer.js, factories.js
backend/__tests__/unit/                 getUserFromToken, protectRoute, generateToken
backend/__tests__/integration/          auth, users, messages, cors, sockets
frontend/babel.config.cjs
frontend/jest.config.cjs
frontend/src/config.js                  (prerequisite: one place for the API address)
frontend/test/                          setup.js, fakeSocket.js, renderWithProviders.jsx, config.stub.js, fileStub.js
frontend/src/**/__tests__/              store, hooks, contexts, components
e2e/start-backend.mjs
e2e/fixtures.mjs
e2e/tests/                              auth, realtime, presence, notifications, session
e2e/mocked/                             session-expiry, errors, degraded-sockets
.github/workflows/test.yml
```
