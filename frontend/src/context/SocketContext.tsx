import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuthContext } from "./AuthContext";
import { API_URL } from "../config";
import type { ClientToServerEvents, ServerToClientEvents } from "../types";

// A socket that knows which events the server sends (see types.ts).
export type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface SocketContextValue {
    socket: ChatSocket | null;
    // The ids of everyone online.
    onlineUsers: string[];
}

const SocketContext = createContext<SocketContextValue>({ socket: null, onlineUsers: [] });

export const useSocketContext = () => useContext(SocketContext);

// Owns the app's single socket connection and the list of online user ids.
// It sits inside AuthContextProvider because the socket's lifetime follows the login.
export const SocketContextProvider = ({ children }: PropsWithChildren) => {
    const { authUser, expireSession } = useAuthContext();
    const [socket, setSocket] = useState<ChatSocket | null>(null);
    const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
    const userId = authUser?._id;

    useEffect(() => {
        // Logged out: no socket. (The previous one was closed by the cleanup below.)
        if (!userId) return;

        // io() opens the connection. The browser attaches the jwt cookie to the
        // handshake (withCredentials is what lets it do so on the polling fallback),
        // which is how the server knows who we are. Nothing here sends a user id:
        // the server reads it from the verified cookie.
        //
        // It connects over WebSocket straight away and falls back to HTTP polling only
        // if that fails. Socket.IO's default is the reverse, polling first and upgrading
        // a moment later, but a tab closed during that upgrade left a connection the
        // server couldn't see was gone until its heartbeat timed out, about 45 seconds
        // later, and the user stayed online all that time.
        const newSocket: ChatSocket = io(API_URL, {
            withCredentials: true,
            transports: ["websocket", "polling"],
            tryAllTransports: true,
        });

        // The server broadcasts the full list on every connect/disconnect.
        newSocket.on("onlineUsers", setOnlineUsers);

        newSocket.on("connect_error", (err) => {
            // The server's auth middleware refused us (cookie missing or expired).
            // Socket.IO does NOT retry after a refusal (newSocket.active is false),
            // so treat it like any other 401 and go back to the login page.
            // Network errors are different: those retry automatically.
            if (err.message === "Unauthorized") expireSession();
        });

        setSocket(newSocket);

        // Cleanup runs when userId changes (logout / another login) and on unmount.
        // In development, React StrictMode runs effects twice on purpose, so you'll
        // see one connection opened and immediately closed. Production doesn't do that.
        return () => {
            newSocket.close();
            setSocket(null);
            setOnlineUsers([]);
        };
    }, [userId, expireSession]);

    return (
        <SocketContext.Provider value={{ socket, onlineUsers }}>
            {children}
        </SocketContext.Provider>
    );
};
