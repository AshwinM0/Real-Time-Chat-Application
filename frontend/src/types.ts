// The JSON the backend sends, as the app reads it, and the socket's events.
// Nothing checks responses when they arrive (see utils/json.ts), so these must
// match what the backend's controllers send. In JSON, ids are strings and dates
// are ISO 8601 strings.

// A user: the people listed in the sidebar, and the logged-in user, which logging
// in or signing up returns and localStorage keeps as "chat-user".
export interface User {
    _id: string
    fullName: string
    username: string
    profilePic: string
}

export type Gender = "male" | "female"

// One message in a chat.
export interface ChatMessage {
    _id: string
    senderId: string
    receiverId: string
    message: string
    createdAt: string
}

// Who sent a message, for the receiver's toast: the socket's newMessage event
// carries it after the message.
export interface MessageSender {
    fullName: string
    profilePic: string
}

// Unread messages for the logged-in user, by the id of the user who sent them.
export type UnreadCounts = Record<string, number>

// What the backend answers instead when something went wrong.
export interface ApiError {
    error: string
}

// What the server sends over the socket. The app sends nothing back.
export interface ServerToClientEvents {
    // Everyone online, by user id, after every connect and disconnect.
    onlineUsers: (userIds: string[]) => void
    newMessage: (message: ChatMessage, sender: MessageSender) => void
}
export type ClientToServerEvents = Record<string, never>
