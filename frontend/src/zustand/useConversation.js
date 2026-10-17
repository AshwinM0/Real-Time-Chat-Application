import { create } from 'zustand'

const useConversation = create((set) => ({
    selectedConversation: null,
    // Opening a chat also clears that user's unread count.
    setSelectedConversation: (selectedConversation) => set((state) => ({
        selectedConversation,
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
    setMessages: (messages) => set({messages}),

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