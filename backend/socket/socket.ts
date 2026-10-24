import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type { MessageDocument } from "../models/messageModel.ts";
import type { RedisClients } from "../redis/client.ts";
import { errorMessage } from "../utils/errorMessage.ts";
import getUserFromToken from "../utils/getUserFromToken.ts";
import { loginToken } from "../utils/loginToken.ts";

// Who sent a message, for the receiver's toast.
export interface MessageSender {
    fullName: string;
    profilePic: string;
}

// The events the server sends. Browsers send none: everything they do goes
// through the REST API, and the socket only carries what happens live.
interface ServerToClientEvents {
    // Everyone online, by user id, after every connect and disconnect.
    onlineUsers: (userIds: string[]) => void;
    // A message just saved, to its receiver and to the sender's tabs.
    newMessage: (message: MessageDocument, sender: MessageSender) => void;
}
type ClientToServerEvents = Record<string, never>;
type InterServerEvents = Record<string, never>;

// What the auth middleware learns from the verified token, kept with each socket.
interface SocketData {
    userId: string;
    username: string;
    jti: string;
}

type ChatServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

// The single Socket.IO server. initSocket() creates it at startup, and other
// backend modules (e.g. messageController) reach it through getIO().
let io: ChatServer | undefined;

// Every socket also joins a room for the login token it connected with. Tabs in
// one browser share the cookie, so they share this room, and so does anyone using
// a copy of the cookie. A different login (another device) has a different token.
const sessionRoom = (jti: string) => `session:${jti}`;

// redis: the clients from connectRedis() when REDIS_URL is set. Not used yet: the
// cross-server adapter and the shared online list will start here with it, which
// is why this is async.
export const initSocket = async (httpServer: HttpServer, { redis: _redis }: { redis?: RedisClients } = {}) => {
    // Presence bookkeeping: userId -> Set of socket ids.
    // One user can hold several sockets at once (two tabs, laptop + phone).
    // They count as online while at least one of those sockets is connected.
    // It lives in here so every server (each test starts its own) begins empty.
    const userSockets = new Map<string, Set<string>>();
    const onlineUserIds = () => [...userSockets.keys()];

    const server: ChatServer = new Server(httpServer, {
        // The socket handshake starts as an ordinary HTTP request from the browser,
        // so Socket.IO needs its own CORS rules; Express's cors() doesn't cover it.
        // credentials: true allows the browser to send the jwt cookie along.
        cors: { origin: process.env.CLIENT_ORIGIN || "http://localhost:3000", credentials: true },
    });
    io = server;

    // Socket.IO middleware: runs once per connection attempt, before "connection".
    // next() lets the socket in. next(new Error(msg)) refuses it, and the browser
    // receives a "connect_error" event whose err.message is msg.
    server.use(async (socket, next) => {
        try {
            // socket.request is the handshake: an ordinary HTTP request, carrying the
            // same cookie as API requests. With the WebSocket transport alone, it's
            // the upgrade request.
            const { user, jti } = await getUserFromToken(loginToken(socket.request));
            if (!user) return next(new Error("Unauthorized"));

            // socket.data is per-connection storage. This userId is trustworthy because
            // it comes from a verified token, never from anything the client claims.
            socket.data.userId = user._id.toString();
            socket.data.username = user.username;
            socket.data.jti = jti;
            next();
        } catch (e) {
            console.log("Error in socket auth middleware: " + errorMessage(e));
            next(new Error("Server error"));
        }
    });

    // "connection" fires once for every socket that got past the middleware.
    server.on("connection", (socket) => {
        const { userId, jti } = socket.data;

        // A room is a server-side, named group of sockets. Putting each of a user's
        // sockets into a room named after their id means io.to(userId).emit(...)
        // reaches every tab and device they have open.
        socket.join(userId);
        // So logging out can close exactly this login's sockets (see disconnectSession).
        socket.join(sessionRoom(jti));

        const sockets = userSockets.get(userId) ?? new Set<string>();
        sockets.add(socket.id);
        userSockets.set(userId, sockets);

        // server.emit() sends to every connected socket, so everyone's online list refreshes.
        server.emit("onlineUsers", onlineUserIds());

        // Fires when the tab closes, the network drops, or the client calls close().
        // Socket.IO removes the socket from its rooms by itself; presence is our job.
        socket.on("disconnect", () => {
            const sockets = userSockets.get(userId);
            sockets?.delete(socket.id);
            if (sockets?.size === 0) userSockets.delete(userId);
            server.emit("onlineUsers", onlineUserIds());
        });
    });

    return server;
};

// Other modules call this instead of importing io directly, so they get a clear
// error if they run before the server was initialised.
export const getIO = (): ChatServer => {
    if (!io) throw new Error("Socket.IO has not been initialised");
    return io;
};

// Closes every socket opened with one login token, once it has been revoked.
// Sockets are only authenticated when they connect, so without this they would
// keep receiving messages after logout. The client sees "io server disconnect"
// and doesn't reconnect. If it tried, the revoked token would be refused.
export const disconnectSession = (jti: string) => getIO().in(sessionRoom(jti)).disconnectSockets();
