# Real-Time Chat Application

A one-to-one chat app built in TypeScript with MongoDB, Express, React and Node.js, using Socket.IO for live updates. Messages arrive instantly, you can see who's online, and chats you aren't looking at collect unread badges.

![Screenshot of the chat app](https://github.com/AshwinM0/Real-Time-Chat-Application/assets/145743047/664f794c-a765-402c-9f75-3cda53ecd0ac)

## Features

- **Real-time messaging** over Socket.IO. Every message is saved to MongoDB first, so messages sent while you were offline load when you open the chat.
- **Online presence** across tabs and devices: you count as online until your last tab closes.
- **Unread badges and in-app notifications** for messages in chats you don't have open.
- **Tabs stay in sync**: a message you send shows up once in every tab you have open.
- **Catch-up after a dropped connection**: when the socket reconnects, the open chat reloads what it missed.
- **Cookie-based authentication**: a JWT in an `httpOnly` cookie, checked on protected API routes and on the socket handshake. When the session expires, you're sent back to the login page.
- **Rate limits** on failed logins, sign-ups and sending, so passwords can't be guessed at speed and nobody can flood a chat.

## Tech stack

| Area | Tools |
|---|---|
| Language | TypeScript, strict, checked by tsc and typescript-eslint (see [Types](#types)) |
| Backend | Node.js, Express, Socket.IO, MongoDB with Mongoose, jsonwebtoken, bcryptjs, express-rate-limit, optionally Redis (node-redis) |
| Frontend | React 18, Vite, Zustand, Tailwind CSS with daisyUI, socket.io-client |
| Tests | Jest, Supertest, mongodb-memory-server, React Testing Library, Playwright |
| CI | GitHub Actions |

## How it works

- **REST for everything stored.** Signing up, logging in, listing users and loading history go through the Express API. Sending a message is a `POST` that saves it to MongoDB.
- **Sockets for everything live.** After saving a message, the server pushes it to the receiver and to all of the sender's tabs. Each socket joins a room named after its user's id, so one emit reaches every tab and device that user has open.
- **One identity check for both.** The socket handshake carries the same `jwt` cookie as API requests, so the server knows who each socket belongs to without trusting anything the client says.
- **Presence lives in memory.** The server keeps a map from user id to open sockets and broadcasts the online list whenever someone connects or disconnects. Because the map lives in one process, this design assumes a single server instance.
- **Rate limits count per client.** Failed logins are limited per address and per username, sign-ups per address, and sending per user. Over a limit, the API answers `429` with a message saying when to try again, which the frontend shows. The counts live in memory, or in Redis when `REDIS_URL` is set, so that several servers would share them. If Redis stops answering, logins are refused until it's back, while sign-ups and messages go through without a limit.

## Getting started

### Prerequisites

- Node.js 20.19 or newer (CI uses Node 22)
- A MongoDB database: a local install, or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster

### 1. Install dependencies

```shell
npm install
npm install --prefix frontend
```

### 2. Set up environment variables

Copy the templates, then fill in `MONGO_DB_URI` and `JWT_SECRET` in `.env`:

```shell
cp .env.example .env
cp frontend/.env.example frontend/.env   # optional: only to change where the frontend finds the API
```

| Variable | File | Required | Default | What it does |
|---|---|---|---|---|
| `MONGO_DB_URI` | `.env` | Yes | | MongoDB connection string |
| `JWT_SECRET` | `.env` | Yes | | Signs login tokens. Changing it logs everyone out. |
| `PORT` | `.env` | Yes | | Port for the API and Socket.IO, for example `5000` |
| `CLIENT_ORIGIN` | `.env` | No | `http://localhost:3000` | The frontend's origin, the only one allowed to call the API with cookies |
| `NODE_ENV` | `.env` | No | `development` | Set to `production` when deploying. Otherwise error responses include stack traces and server file paths. |
| `REDIS_URL` | `.env` | No | | Redis connection string, for example `redis://:<password>@127.0.0.1:6379`, or `rediss://…` for TLS. Rate-limit counts are then kept in Redis and shared by every backend server; without it, they're kept in memory. Works with real Redis or [redis-in-java](https://github.com/AshwinM0/redis-in-java). Write `127.0.0.1`: `localhost` may resolve to IPv6, where redis-in-java doesn't listen. |
| `REDIS_TLS_CA` | `.env` | No | | With a `rediss://` URL: a PEM file with the authority that signed the Redis server's certificate, when Node doesn't already trust it, such as a self-signed one. The certificate must name the host in the URL; for `127.0.0.1`, as an IP address. |
| `REDIS_TLS_CERT`, `REDIS_TLS_KEY` | `.env` | No | | With a `rediss://` URL: the backend's own certificate and key (PEM), for a Redis server that requires client certificates. Set both or neither. |
| `TRUST_PROXY` | `.env` | No | | How many proxies, such as a load balancer, sit in front of the backend, for example `1`. Then rate limits see each client's address instead of the proxy's. Never set more than there are: clients could fake their address. |
| `RATE_LIMIT_LOGIN_PER_IP` | `.env` | No | `20` | Failed logins allowed per address in 15 minutes |
| `RATE_LIMIT_LOGIN_PER_USER` | `.env` | No | `5` | Failed logins allowed per username in 15 minutes, from any address |
| `RATE_LIMIT_SIGNUP_PER_IP` | `.env` | No | `10` | Sign-ups allowed per address in an hour |
| `RATE_LIMIT_SEND_PER_USER` | `.env` | No | `20` | Messages a user can send in 10 seconds |
| `VITE_API_URL` | `frontend/.env` | No | `http://localhost:5000` | Where the frontend finds the backend. Read when Vite starts or builds. |

The server checks the three required variables when it starts and stops with a message naming any that are missing. It also stops if it can't connect to MongoDB or, when `REDIS_URL` is set, to Redis within 5 seconds, or if the `REDIS_TLS_*` settings don't fit the URL.

When Redis closes a connection, the backend reconnects by itself and logs `Redis closed the connection; reconnecting`. redis-in-java does this on purpose when `REDIS_MAX_CONNECTION_AGE` is set. A rate-limit check caught by the close is sent once more, so no request fails because of it.

To generate a strong `JWT_SECRET`:

```shell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

#### Keeping secrets out of git

- Every `.env` file is gitignored. Only the `.env.example` templates are committed, and they hold no real values.
- `.gitignore` only applies to files git isn't already tracking. If a `.env` was ever committed, stop tracking it with `git rm --cached .env`.
- If a secret reaches a commit, treat it as public and **rotate it**: set a new database password and a new `JWT_SECRET`. Deleting the file in a later commit leaves the secret in the history.
- Variables starting with `VITE_` are built into the JavaScript that browsers download, so anyone can read them. Never put a secret in one.

### 3. Run it

In two terminals:

```shell
npm run server                 # backend on the PORT you set, run by tsx; restarts when files change
npm --prefix frontend run dev  # frontend on http://localhost:3000
```

Open http://localhost:3000 and sign up. To try real-time chat on your own, sign up a second user in a private window.

### Production build

```shell
npm --prefix frontend run build   # checks the types, then writes static files to frontend/dist
npm run build                     # compiles the backend to dist/
npm start                         # runs dist/server.js, without auto-restart
```

Set `VITE_API_URL` before building, and set `CLIENT_ORIGIN` on the backend to the frontend's URL. Serve the frontend and backend from the same site, for example `app.example.com` and `api.example.com`: the login cookie isn't marked `SameSite=None`, so browsers won't reliably send it across sites.

## Testing

| Command | What it runs |
|---|---|
| `npm run test:backend` | Unit tests, plus API and Socket.IO integration tests against an in-memory MongoDB |
| `npm run test:frontend` | Hooks, components and the chat store, with React Testing Library and a fake socket |
| `npm run test:e2e` | Playwright tests in Chromium against the real backend and a production build of the frontend, plus a few with the API mocked |
| `npm test` | All three, in that order |
| `npm run typecheck`, `npm run lint` | Type check and lint the backend and the end-to-end tests |
| `npm --prefix frontend run typecheck`, `npm --prefix frontend run lint` | The same for the frontend |

The tests never use your database, your Redis or your secrets: they set their own variables, raise the rate limits, and run MongoDB in memory. The first run downloads a MongoDB binary, which can take a minute.

For coverage reports, run `npm run test:backend -- --coverage` or `npm --prefix frontend test -- --coverage`.

Before the first end-to-end run, install Playwright's browser:

```shell
npx playwright install chromium
```

The end-to-end tests start their own backend on port 5100 and frontend on port 3100. If either port is busy, for example because the VS Code Playwright extension is holding it, the run stops with an "already used" error.

Tests marked `test.failing` document known bugs, such as missing input validation. They start failing once the bug is fixed, as a reminder to turn them into normal tests.

GitHub Actions checks the types and lint, and runs all three suites, on every push and pull request.

## Types

The code is TypeScript in strict mode, with `noUncheckedIndexedAccess`. tsx (in development), Babel (in Jest) and Vite only remove the types without checking them, so `npm run typecheck` and CI are what catch type errors.

Lint rules keep `any` out of the app's code, though not out of the tests: no `any` or `unknown` written out, no `as` casts, no non-null `!`, and no passing on an `any` that a library returned, such as from `JSON.parse`. Where one is truly needed, the rule is turned off on that line with the reason: a caught error, and the Express error handler's argument, can be any value, so those are `unknown` until checked.

Two kinds of values are trusted rather than checked when they arrive:

- **JSON in the frontend.** `readJson` and `parseJson` in [frontend/src/utils/json.ts](frontend/src/utils/json.ts) give API responses, and the user saved in localStorage, the type the caller names. Those types, in [frontend/src/types.ts](frontend/src/types.ts), must match what the backend sends.
- **Request bodies in the backend.** Each handler declares the body it expects ([backend/types.ts](backend/types.ts)), but nothing validates it yet: the `test.failing` tests BI-4 and BI-15 track that.

A schema library such as zod would turn both into checked types.

## Project structure

```
backend/
  server.ts     entry point: HTTP server, Socket.IO and the MongoDB connection
  app.ts        builds the Express app, shared by server.ts and the tests
  types.ts      the request and error bodies the API takes and sends
  socket/       Socket.IO: handshake authentication, presence, rooms
  redis/        the optional Redis connection
  middleware/   login check (protectRoute) and rate limits
  controllers/, routes/, models/, db/, utils/
  __tests__/    unit and integration tests (helpers in test/)
frontend/
  src/
    types.ts    the API's JSON and the socket's events, as the app reads them
    context/    logged-in user and the socket connection
    zustand/    chat store: open conversation, messages, unread counts
    components/, pages/, hooks/
  test/         Jest helpers
e2e/            Playwright tests: real backend in tests/, mocked API in mocked/
tsconfig.json  TypeScript projects: the backend, its tests and e2e (the frontend has its own)
.github/workflows/test.yml   CI
```
