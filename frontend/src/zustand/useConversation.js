import { create } from 'zustand'

// The order a chat shows messages in: by createdAt, then by _id for messages saved
// in the same millisecond. Both are strings that sort correctly as plain text.
const byTime = (a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 :
    a._id < b._id ? -1 : a._id > b._id ? 1 : 0

const useConversation = create((set) => ({
    selectedConversation: null,
    // Opening a chat also clears that user's unread count. Opening a different chat
    // starts from an empty list, so `messages` only ever holds the open chat.
    setSelectedConversation: (selectedConversation) => set((state) => ({
        selectedConversation,
        messages: selectedConversation?._id === state.selectedConversation?._id ? state.messages : [],
        unread: selectedConversation
            ? { ...state.unread, [selectedConversation._id]: 0 }
            : state.unread
    })),

    // Unread counts per user id, for messages that arrived while their chat was closed.
    // Kept in memory only: they reset on reload (persisting them needs a schema change).
    unread: {},
    incrementUnread: (userId) => set((state) => ({
        unread: { ...state.unread, [userId]: (state.unread[userId] || 0) + 1 }
    })),
    messages: [],

    // Adds a page of the open chat's history: the newest page when it opens, an
    // older one as the user scrolls up, or messages missed while disconnected.
    // Messages already shown are skipped and the list stays in time order, so
    // pages and live messages can arrive in any order. Ignored if chatId is no
    // longer the open chat (the user switched while the page was loading).
    mergeMessages: (chatId, page) => set((state) => {
        if (state.selectedConversation?._id !== chatId) return state
        const shown = new Set(state.messages.map((m) => m._id))
        const fresh = page.filter((m) => !shown.has(m._id))
        return fresh.length ? { messages: [...state.messages, ...fresh].sort(byTime) } : state
    }),

    // Append one message safely. Passing a function to set() gives us the
    // *current* state at the moment it runs, so a message that arrived over the
    // socket a millisecond ago is never overwritten by an older copy of the list.
    addMessage: (message) => set((state) => {
        const openId = state.selectedConversation?._id
        // The store only holds the open chat. Ignore messages for any other chat.
        const belongsHere = message.senderId === openId || message.receiverId === openId
        // The sender's tab gets its own message twice: once from the HTTP response
        // and once from the socket. The _id check keeps only the first.
        const duplicate = state.messages.some((m) => m._id === message._id)
        // Returning the same state object tells Zustand nothing changed (no re-render).
        return belongsHere && !duplicate ? { messages: [...state.messages, message] } : state
    })
}))

export default useConversation