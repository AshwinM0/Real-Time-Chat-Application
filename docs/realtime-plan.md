# CHAT: codebase overview and real-time plan

This document has two parts. Part 1 describes what the repo contains today and how it works. Part 2 assesses the proposal to add WebSockets and lays out an implementation plan.

---

## Part 1: What this repo is

A one-to-one chat app on the MERN stack. Users sign up, log in, pick another user from a sidebar and exchange text messages. Everything goes over plain HTTP request/response today, so nothing updates live.

### Stack

| Layer | Tech |
|---|---|
| Backend | Node (ES modules), Express 4, Mongoose 8, MongoDB |
| Auth | bcryptjs password hashing, JWT in an httpOnly cookie, cookie-parser |
| Frontend | React 18, Vite 5, React Router 6 |
| State | React Context for the logged-in user, Zustand for the open chat |
| UI | Tailwind 3, daisyUI 4, react-icons, react-hot-toast |
| Unused | `socket.io` 4.7 is in the root dependencies and installed, but nothing imports it |

### How to run it (actual)

The README says `npm run build` and `npm start`, but neither script exists. The real way is two processes:

```shell
# terminal 1, repo root: backend on PORT from .env (the frontend expects 5000)
npm run server

# terminal 2: frontend on port 3000
cd frontend && npm run dev
```

The backend does not serve the built frontend, and the frontend calls `http://localhost:5000` directly.

### Layout

```
CHAT/
├── package.json                  backend dependencies + "server" script (nodemon)
├── .env                          PORT, MONGO_DB_URI, JWT_SECRET, NODE_ENV
├── backend/
│   ├── server.js                 Express app, CORS, route mounting, listen
│   ├── db/connectToDB.js         mongoose.connect
│   ├── models/                   User, Conversation, Message
│   ├── routes/                   auth, messages, users
│   ├── controllers/              request handlers for each route group
│   ├── middleware/protectRoute.js   reads the jwt cookie, sets req.user
│   └── utils/generateToken.js    signs the JWT and sets the cookie (15 days)
└── frontend/src/
    ├── main.jsx, App.jsx         router and the logged-in / logged-out gate
    ├── context/AuthContext.jsx   current user, mirrored in localStorage "chat-user"
    ├── zustand/useConversation.js   selected chat + its messages
    ├── hooks/                    one hook per API call (login, signup, logout,
    │                             get users, get messages, send message)
    ├── pages/                    home, login, signup
    └── components/               sidebar/, messages/, skeletons/
```

### Data model

- **User**: `fullName`, `username` (unique), `password` (bcrypt hash), `gender` (`male` or `female`), `profilePic`. The picture is a generated avatar URL picked by gender and username at signup.
- **Conversation**: `participants` (two user ids) and `messages` (an array of message ids). One is created on the first message between two users.
- **Message**: `senderId`, `receiverId`, `message` (text). All three models have timestamps.

### API

| Method | Path | Auth | What it does |
|---|---|---|---|
| POST | `/api/auth/signup` | none | Creates the user, sets the jwt cookie, returns the profile |
| POST | `/api/auth/login` | none | Checks the password, sets the jwt cookie, returns the profile |
| POST | `/api/auth/logout` | none | Clears the cookie |
| GET | `/api/users` | cookie | Every user except the caller. This is the sidebar list |
| GET | `/api/messages/:id` | cookie | All messages between the caller and user `:id` |
| POST | `/api/messages/send/:id` | cookie | Saves a message to user `:id`, creating the conversation if needed |

### How the main flows work

**Auth.** Login or signup returns the user profile and sets an httpOnly `jwt` cookie. The client saves the profile to localStorage, and `AuthContext` reads it on startup. `App.jsx` shows Home when that profile exists. Every API hook sends the cookie with `credentials: 'include'`, and `protectRoute` verifies it and loads the user. The client's idea of "logged in" comes only from localStorage, so it can disagree with the server once the cookie expires.

**Sending.** `MessageInput` calls `useSendMessage`, which POSTs to `/api/messages/send/:id`. The server finds or creates the conversation, saves the message, pushes its id onto the conversation and returns it. The sender's hook appends the message to the Zustand store.

**Receiving.** There is no receiving. `useGetMessages` fetches the history only when the selected conversation changes. The other user sees a new message only after re-selecting the chat or reloading. This is the gap WebSockets fill.

**Sidebar.** `useGetConversations` loads all users once. Every avatar has a hard-coded `online` class, so everyone shows a green dot whether they are online or not.

### Issues found

These three affect the real-time work. The first two were fixed on 2026-10-17, along with the duplicate user-list fetch. The third is still open and is covered by Phase 0.3.

| Where | Problem | Effect |
|---|---|---|
| `frontend/src/hooks/useSignUp.js` | The signup fetch has no `credentials: 'include'` | The browser drops the cookie. A new user lands on Home, then every API call returns 401 until they log out and back in. A cookie-authenticated socket would fail the same way. |
| `backend/middleware/protectRoute.js` | `jwt.verify` throws on an expired or invalid token, which falls into the catch | Expired sessions return 500 instead of 401 |
| `frontend/src/hooks/useSendMessage.js` | Appends with `setMessages([...messages, data])` using a captured `messages` array | Once messages arrive over a socket, one that lands while a send is in flight gets overwritten |

These are worth fixing but do not block anything.

- `.env` is committed even though `.gitignore` lists it. Untrack it with `git rm --cached .env` and keep an `.env.example` with placeholder values instead.
- The README's build and start instructions are wrong, as described above.
- `app.options(cors())` in `server.js` registers nothing. Preflight works only because each route group has its own `cors(corsOptions)`.
- `/api/messages` runs `protectRoute` twice, once in `server.js` and again in `messageRoutes.js`, so each request does two user lookups.
- A failed database connection is logged, but the server keeps listening.
- `Conversations.jsx` passes `lastIdc` while `Conversation.jsx` reads `lastIdx`, so a divider also renders after the last user.
- `signUp.jsx` imports `set` from `mongoose`. It is unused and pulls a server library into the browser bundle.
- The API base URL is hard-coded in all six hooks. A `VITE_API_URL` variable would make deployment possible.
- `getMessages` returns the entire history with no pagination, and the conversation's `messages` array grows forever.
- `sendMessage` does not validate input. An empty message or a malformed user id returns 500.
- The page title is still "Vite + React", and there are no tests.

---

## Part 2: Adding WebSockets

**Status, 2026-10-17:** Phases 0 to 4 are implemented on the `realtime` branch. The optional browser notifications in 4.4 and everything in Phase 5 are not. The code sketches below have been updated to match the code.

### Verdict

This is the right next feature, and Socket.IO is the right tool. It is already a dependency, so the original author clearly meant to add it. Live delivery, presence and notifications all share one connection, so presence and notifications cost little once delivery works.

The proposed outline has the right shape. Keep these parts as proposed:

- Attach Socket.IO to the same HTTP server as Express.
- Emit `newMessage` from `sendMessage` after the save succeeds. MongoDB stays the source of truth, and the socket is only a push channel.
- Append incoming messages to the Zustand store on the client.
- Broadcast the online-user list for presence.

Four details need to change.

1. **Do not let the client say who it is.** If the client passes its `userId` when connecting, anyone can connect as any user and receive that user's messages. The handshake should carry the existing httpOnly `jwt` cookie, and the server should derive the user id from it, exactly like `protectRoute` does.
2. **A user can have more than one socket.** With a `userId → socket.id` map, a second tab overwrites the first, and closing either tab marks the user offline. Use one Socket.IO room per user for delivery, and a set of socket ids per user for presence.
3. **The store only holds the open chat.** `useConversation` keeps the messages of the selected conversation only. Appending every incoming message would put a message from Bob into your chat with Carol. A message is appended only when it belongs to the open chat. Otherwise it becomes a notification.
4. **Listen somewhere that is always mounted.** If the listener lives in `Messages.jsx`, it only exists while a chat is open, and notifications are missed when none is selected. Mount it in Home.

Socket.IO also needs its own CORS settings. The Express `cors` middleware does not apply to it.

### Event contract

| Event | Direction | Payload | Sent when |
|---|---|---|---|
| `onlineUsers` | server to all clients | array of user id strings | Any socket connects or disconnects |
| `newMessage` | server to the receiver's and sender's rooms | `(message, sender)` where sender is `{ fullName, profilePic }` | After a message is saved |
| `connect_error` with message `"Unauthorized"` | server to the connecting client | Error | The handshake cookie is missing, invalid or expired |

---

### Phase 0: Prerequisite fixes

**0.1 Send the cookie on signup.** Done on 2026-10-17. The signup fetch now sends `credentials: 'include'`. On the same day, `AuthContext` gained an `expireSession` function, which the protected hooks call on a 401 to clear the saved user and return to the login page.

**0.2 Share token verification.** Since 2026-10-17, `protectRoute` returns 401 for invalid or expired tokens and for users who no longer exist. That logic now lives in a shared helper, `backend/utils/getUserFromToken.js`, so the socket handshake checks logins exactly the way the REST API does. It returns `{ user }` on success, or `{ error }` with the reason, which keeps the existing error messages.

```js
const getUserFromToken = async (token) => {
    if(!token) return { error: "No Token Provided" }

    let decoded
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET)
    } catch {
        return { error: "Invalid Token" }
    }

    const user = await User.findById(decoded.userId).select("-password")
    if(!user) return { error: "User not found" }

    return { user }
}
```

`protectRoute` now calls the helper and answers 401 with `"Unauthorized - " + error` whenever it returns an error.

**0.3 Make appends safe.** In `frontend/src/zustand/useConversation.js`, add an `addMessage` action. It reads the latest state, ignores duplicates and ignores messages that do not belong to the open chat. That last check also fixes a small existing race, where switching chats during a send appended the message to the wrong one.

```js
addMessage: (message) =>
  set((state) => {
    const openId = state.selectedConversation?._id;
    const belongsHere = message.senderId === openId || message.receiverId === openId;
    const duplicate = state.messages.some((m) => m._id === message._id);
    return belongsHere && !duplicate ? { messages: [...state.messages, message] } : state;
  }),
```

In `useSendMessage.js`, replace `setMessages([...messages, data])` with `addMessage(data)`.

---

### Phase 1: Socket server, authentication and presence

**1.1** No new backend dependency is needed. Engine.IO, the transport layer under Socket.IO, accepts Express-style middleware through `io.engine.use()`. Giving it the same `cookie-parser` that Express uses fills in `socket.request.cookies` for the handshake middleware.

**1.2** Create `backend/socket/socket.js`. This sketch is trimmed; the real file also logs connects and disconnects.

```js
import { Server } from "socket.io";
import cookieParser from "cookie-parser";
import getUserFromToken from "../utils/getUserFromToken.js";

let io;

// userId -> Set of socket ids. A user is online while their set is not empty.
const userSockets = new Map();
const onlineUserIds = () => [...userSockets.keys()];

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: "http://localhost:3000", credentials: true },
  });

  // Run cookie-parser on the handshake request so socket.request.cookies exists.
  io.engine.use(cookieParser());

  // Authenticate the handshake with the same jwt cookie the REST API uses.
  io.use(async (socket, next) => {
    try {
      const { user } = await getUserFromToken(socket.request.cookies?.jwt);
      if (!user) return next(new Error("Unauthorized"));
      socket.data.userId = user._id.toString();
      next();
    } catch (e) {
      next(new Error("Server error"));
    }
  });

  io.on("connection", (socket) => {
    const { userId } = socket.data;

    // One room per user reaches every tab and device that user has open.
    socket.join(userId);
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(socket.id);
    io.emit("onlineUsers", onlineUserIds());

    socket.on("disconnect", () => {
      const sockets = userSockets.get(userId);
      sockets?.delete(socket.id);
      if (sockets?.size === 0) userSockets.delete(userId);
      io.emit("onlineUsers", onlineUserIds());
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket.IO has not been initialised");
  return io;
};
```

**1.3** In `backend/server.js`, create the HTTP server explicitly so Express and Socket.IO share it.

```js
import http from "http";
import { initSocket } from "./socket/socket.js";

// ...existing app setup...

const server = http.createServer(app);
initSocket(server);

server.listen(PORT, async () => {
  await connectToDB();
  console.log("listening on PORT " + PORT);
});
```

---

### Phase 2: Push new messages

In `backend/controllers/messageController.js`, emit right after the save and before the response. `req.user` is the sender, already loaded by `protectRoute`.

```js
import { getIO } from "../socket/socket.js";

// ...after: await Promise.all([conversation.save(), newMessage.save()])

const sender = { fullName: req.user.fullName, profilePic: req.user.profilePic };
getIO()
  .to([receiverId, senderId.toString()])
  .emit("newMessage", newMessage, sender);

res.status(201).json(newMessage);
```

Sending to the sender's room keeps their other tabs in sync. The sending tab gets the message twice, once from the socket and once from the HTTP response. `addMessage` drops the duplicate by `_id`.

If the receiver is offline, the emit reaches nobody. That is fine, because the message is in MongoDB and loads the next time they open the chat.

---

### Phase 3: Client connection, live messages and presence

**3.1** Install the client in the frontend.

```shell
cd frontend && npm install socket.io-client@4
```

**3.2** Create `frontend/src/context/SocketContext.jsx`. It connects when a user is logged in and disconnects on logout.

```jsx
import { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useAuthContext } from "./AuthContext";

const SocketContext = createContext({ socket: null, onlineUsers: [] });
export const useSocketContext = () => useContext(SocketContext);

export const SocketContextProvider = ({ children }) => {
  const { authUser, expireSession } = useAuthContext();
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);

  useEffect(() => {
    if (!authUser) return;

    const s = io("http://localhost:5000", { withCredentials: true });
    s.on("onlineUsers", setOnlineUsers);
    s.on("connect_error", (err) => {
      // The cookie is gone or expired, so the saved user is stale.
      if (err.message === "Unauthorized") expireSession();
    });
    setSocket(s);

    return () => {
      s.close();
      setSocket(null);
      setOnlineUsers([]);
    };
  }, [authUser?._id, expireSession]);

  return (
    <SocketContext.Provider value={{ socket, onlineUsers }}>
      {children}
    </SocketContext.Provider>
  );
};
```

The `connect_error` handler matters. Socket.IO does not retry after a middleware rejection, so without it the app would sit on a dead socket. It reuses `expireSession`, so a rejected socket behaves the same way as a REST call that gets a 401.

Wrap the app in `main.jsx`, inside the auth provider:

```jsx
<AuthContextProvider>
  <SocketContextProvider>
    <App />
  </SocketContextProvider>
</AuthContextProvider>
```

React StrictMode mounts effects twice in development, so you will briefly see two connections. The cleanup closes the first one. This does not happen in production builds.

**3.3** Create `frontend/src/hooks/useListenMessages.js` and call it from `pages/home/home.jsx`.

```js
import { useEffect } from "react";
import { useSocketContext } from "../context/SocketContext";
import useConversation from "../zustand/useConversation";

const useListenMessages = () => {
  const { socket } = useSocketContext();

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message, sender) => {
      // Read the store at event time, not at render time, to avoid stale values.
      useConversation.getState().addMessage(message);
    };

    socket.on("newMessage", handleNewMessage);
    return () => socket.off("newMessage", handleNewMessage);
  }, [socket]);
};

export default useListenMessages;
```

**3.4** Show real presence. In `components/sidebar/Conversation.jsx`, replace the hard-coded `online` class:

```jsx
const { onlineUsers } = useSocketContext();
const isOnline = onlineUsers.includes(conversation._id);

<div className={`avatar ${isOnline ? "online" : ""}`}>
```

The chat header in `MessageContainer.jsx` can show the same status next to the name.

**3.5 Optional resync after reconnects.** Messages sent while a client's socket was down are saved but never pushed. Socket.IO reconnects on its own, so refetch the open chat when that happens. In `useGetMessages`, register `socket.io.on("reconnect", getMessages)` and remove it in the effect cleanup.

---

### Phase 4: Notifications

**4.1** Add unread counts to `useConversation`, and clear a user's count when their chat is opened.

```js
unread: {},
incrementUnread: (userId) =>
  set((state) => ({
    unread: { ...state.unread, [userId]: (state.unread[userId] || 0) + 1 },
  })),
setSelectedConversation: (selectedConversation) =>
  set((state) => ({
    selectedConversation,
    unread: selectedConversation
      ? { ...state.unread, [selectedConversation._id]: 0 }
      : state.unread,
  })),
```

**4.2** Extend the handler in `useListenMessages`. It needs `authUser` from `useAuthContext()`, `toast` from react-hot-toast, and `authUser._id` in the effect's dependencies.

```js
const handleNewMessage = (message, sender) => {
  const { selectedConversation, addMessage, incrementUnread } = useConversation.getState();
  addMessage(message);

  const fromMe = message.senderId === authUser._id;
  const chatIsOpen = message.senderId === selectedConversation?._id;
  if (!fromMe && !chatIsOpen) {
    incrementUnread(message.senderId);
    toast(`${sender.fullName}: ${message.message}`);
  }
};
```

**4.3** Show a badge in `Conversation.jsx`:

```jsx
const unreadCount = useConversation((s) => s.unread[conversation._id] || 0);

{unreadCount > 0 && <span className="badge badge-primary badge-sm">{unreadCount}</span>}
```

**4.4 Optional.** When `document.hidden` is true, also show a browser notification with the Notification API. That needs a one-time permission prompt, ideally triggered by a button rather than on page load.

These counts live in memory, so they reset on reload and do not cover messages received while offline. Persistent unread state needs the schema change in Phase 5.

---

### Phase 5: Later

- **Persistent unread and read receipts.** Add `readAt` to Message, or a `lastReadAt` per participant on Conversation. Then return unread counts with `/api/users` and emit a `messagesRead` event when a chat is opened.
- **Typing indicator.** The client emits `typing` with a receiver id, and the server forwards it to that user's room. The sender should be taken from `socket.data.userId`, never from the payload.
- **Message pagination.** Query the Message collection by participants with a limit and a cursor, instead of populating the whole conversation.
- **Multiple server instances.** Rooms and the `userSockets` map live in one Node process. Running more than one instance needs `@socket.io/redis-adapter`, with presence moved into Redis. A single instance does not need this.
- **Config.** Move `http://localhost:3000` and `http://localhost:5000` into environment variables for both CORS settings and the client.

---

### Test checklist

Use two browsers, or one normal window and one private window, logged in as different users, A and B.

1. A sends to B while B has A's chat open. B sees it instantly.
2. B has C's chat open when A sends. Nothing appears in the chat with C, and B gets a toast and a badge on A.
3. B has no chat open when A sends. B gets a toast and a badge.
4. B closes their browser. A sees B's dot disappear.
5. B has two tabs open and closes one. B stays online for A.
6. A has two tabs open and sends from one. The message appears exactly once in both tabs.
7. A logs out. B sees A go offline.
8. Delete the `jwt` cookie in devtools and reload. The app returns to the login page instead of half-working.
9. Sign up a new user. The socket connects and the sidebar loads without a 401.
10. Restart the backend. Clients reconnect on their own, and presence repopulates.
