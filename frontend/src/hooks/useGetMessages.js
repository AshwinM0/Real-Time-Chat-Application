import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import useConversation from '../zustand/useConversation'
import { useAuthContext } from '../context/AuthContext'
import { useSocketContext } from '../context/SocketContext'
import { API_URL } from '../config'

// Messages per request. The server sends at most this many, so a shorter page
// means the start of the chat has been reached.
export const PAGE_SIZE = 50

// Loads the open chat a page at a time: the newest messages when it opens, older
// ones when Messages.jsx asks (the user scrolled to the top), and whatever was
// missed while the socket was disconnected.
const useGetMessages = () => {
    const {messages, mergeMessages, selectedConversation} = useConversation()
    const { expireSession } = useAuthContext()
    const { socket } = useSocketContext()
    const chatId = selectedConversation?._id

    // Which chat's first page has arrived. Until it matches the open chat, the
    // chat is loading, including right after switching chats.
    const [loadedChatId, setLoadedChatId] = useState(null)
    const [hasOlder, setHasOlder] = useState(false)
    const [loadingOlder, setLoadingOlder] = useState(false)
    const olderInFlight = useRef(false)

    // One page of the open chat. cursor picks which: nothing for the newest messages,
    // { before, beforeId } for older ones, { after, afterId } for newer ones.
    // Resolves to the page, oldest first, or to null if the session expired or the
    // user opened another chat meanwhile. Throws on other errors.
    const fetchPage = useCallback(async (cursor = {}) => {
        const params = new URLSearchParams({ limit: PAGE_SIZE, ...cursor })
        const res = await fetch(`${API_URL}/api/messages/${chatId}?${params}`, {
            credentials : 'include'
        });

        if(res.status === 401) {
            expireSession()
            return null
        }

        const data = await res.json()

        if(data.error) throw new Error(data.error);

        return useConversation.getState().selectedConversation?._id === chatId ? data : null
    }, [chatId, expireSession])

    // The newest page: when a chat opens, and after a reconnect if it was empty.
    const loadNewest = useCallback(async () => {
        try {
            const page = await fetchPage()
            if(!page) return
            mergeMessages(chatId, page)
            setHasOlder(page.length === PAGE_SIZE)
        } catch(e) {
            toast.error(e.message)
        } finally {
            if(useConversation.getState().selectedConversation?._id === chatId) setLoadedChatId(chatId)
        }
    }, [chatId, fetchPage, mergeMessages])

    useEffect(() => {
        if(!chatId) return
        setHasOlder(false)
        loadNewest()
    }, [chatId, loadNewest])

    // Catching up after a reconnect. A separate effect, so the socket appearing
    // (or changing) doesn't reload the chat.
    useEffect(() => {
        if(!chatId || !socket) return

        // The newest message shown when the connection dropped. Anything after it may
        // have been missed: while the connection was down, messages were still saved
        // to MongoDB but never pushed to us. (Not the newest message shown now: this
        // tab may have sent one over HTTP meanwhile, after the ones it missed.)
        let newestAtDisconnect
        const onDisconnect = () => {
            const shown = useConversation.getState().messages
            newestAtDisconnect = shown[shown.length - 1]
        }

        // After Socket.IO reconnects, fetch everything after that message and add it,
        // keeping any older pages the user had scrolled back to.
        const catchUp = async () => {
            let cursor = newestAtDisconnect
            if(!cursor) return loadNewest()
            try {
                let page
                do {
                    page = await fetchPage({ after: cursor.createdAt, afterId: cursor._id })
                    if(!page) return
                    mergeMessages(chatId, page)
                    cursor = page[page.length - 1]
                } while(page.length === PAGE_SIZE)
            } catch(e) {
                toast.error(e.message)
            }
        }

        // "reconnect" is emitted by the Manager (socket.io), the object that owns the
        // underlying connection and handles the retrying.
        const manager = socket.io
        socket.on("disconnect", onDisconnect)
        manager.on("reconnect", catchUp)
        return () => {
            socket.off("disconnect", onDisconnect)
            manager.off("reconnect", catchUp)
        }
    }, [chatId, socket, fetchPage, mergeMessages, loadNewest])

    // The page before the oldest message shown. Messages.jsx calls this when the
    // user scrolls to the top. Only one runs at a time.
    const loadOlder = useCallback(async () => {
        const oldest = useConversation.getState().messages[0]
        if(!oldest || olderInFlight.current) return
        olderInFlight.current = true
        setLoadingOlder(true)
        try {
            const page = await fetchPage({ before: oldest.createdAt, beforeId: oldest._id })
            if(!page) return
            mergeMessages(chatId, page)
            setHasOlder(page.length === PAGE_SIZE)
        } catch(e) {
            toast.error(e.message)
        } finally {
            olderInFlight.current = false
            setLoadingOlder(false)
        }
    }, [chatId, fetchPage, mergeMessages])

    const loading = Boolean(chatId) && loadedChatId !== chatId

    return {loading, messages, hasOlder, loadingOlder, loadOlder}
}

export default useGetMessages
