import { useEffect } from 'react'
import useConversation from '../zustand/useConversation'
import { API_URL } from '../config'

// The id of the newest message the other user sent in the open chat, if any.
const newestFromThem = (state) => {
    const chatId = state.selectedConversation?._id
    for(let i = state.messages.length - 1; i >= 0; i--) {
        if(state.messages[i].senderId === chatId) return state.messages[i]._id
    }
}

// Tells the server the open chat has been read, so its unread count stays at zero
// after a reload: once its messages have loaded, and again whenever a new message
// from the other user appears in it. Your own messages and older pages don't count.
const useMarkRead = () => {
    const chatId = useConversation((state) => state.selectedConversation?._id)
    const newestId = useConversation(newestFromThem)

    useEffect(() => {
        if(!chatId || !newestId) return
        // Best effort: if it fails, the worst case is the badge coming back after a reload.
        fetch(`${API_URL}/api/messages/${chatId}/read`, {
            method : 'POST',
            credentials : 'include'
        }).catch(() => {})
    }, [chatId, newestId])
}

export default useMarkRead
