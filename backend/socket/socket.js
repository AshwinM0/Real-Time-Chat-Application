import { Server } from "socket.io";
import cookieParser from "cookie-parser";
import getUserFromToken from "../utils/getUserFromToken.js";

// The single Socket.IO server. initSocket() creates it at startup, and other
// backend modules (e.g. messageController) reach it through getIO().
let io;

export const initSocket = (httpServer) => {
    // Presence bookkeeping: userId -> Set of socket ids.
    // One user can hold several sockets at once (two tabs, laptop + phone).
    // They count as online while at least one of those sockets is connected.
    // It lives in here so every server (each test starts its own) begins empty.
    const userSockets = new Map();
    const onlineUserIds = () => [...userSockets.keys()];

    io = new Server(httpServer, {
        // The socket handshake starts as an ordinary HTTP request from the browser,
        // so Socket.IO needs its own CORS rules; Express's cors() doesn't cover it.
        // credentials: true allows the browser to send the jwt cookie along.
        cors: { origin: process.env.CLIENT_ORIGIN || "http://localhost:3000", credentials: true },
    });

    // Engine.IO is the transport layer underneath Socket.IO (polling + WebSocket).
    // io.engine.use() runs Express-style middleware on its raw HTTP requests, so the
    // same cookie-parser Express uses fills in socket.request.cookies for us.
    io.engine.use(cookieParser());

    // Socket.IO middleware: runs once per connection attempt, before "connection".
    // next() lets the socket in. next(new Error(msg)) refuses it, and the browser
    // receives a "connect_error" event whose err.message is msg.
    io.use(async (socket, next) => {
        try {
            const { user } = await getUserFromToken(socket.request.cookies?.jwt);
            if (!user) return next(new Error("Unauthorized"));

            // socket.data is per-connection storage. This userId is trustworthy because
            // it comes from a verified token, never from anything the client claims.
            socket.data.userId = user._id.toString();
            socket.data.username = user.username;
            next();
        } catch (e) {
            console.log("Error in socket auth middleware: " + e.message);
            next(new Error("Server error"));
        }
    });

    // "connection" fires once for every socket that got past the middleware.
    io.on("connection", (socket) => {
        const { userId, username } = socket.data;

        // A room is a server-side, named group of sockets. Putting each of a user's
        // sockets into a room named after their id means io.to(userId).emit(...)
        // reaches every tab and device they have open.
        socket.join(userId);

        if (!userSockets.has(userId)) userSockets.set(userId, new Set());
        userSockets.get(userId).add(socket.id);

        // io.emit() sends to every connected socket, so everyone's online list refreshes.
        io.emit("onlineUsers", onlineUserIds());

        // Fires when the tab closes, the network drops, or the client calls close().
        // Socket.IO removes the socket from its rooms by itself; presence is our job.
        socket.on("disconnect", (reason) => {
            const sockets = userSockets.get(userId);
            sockets?.delete(socket.id);
            if (sockets?.size === 0) userSockets.delete(userId);
            io.emit("onlineUsers", onlineUserIds());
        });
    });

    return io;
};

// Other modules call this instead of importing io directly, so they get a clear
// error if they run before the server was initialised.
export const getIO = () => {
    if (!io) throw new Error("Socket.IO has not been initialised");
    return io;
};
