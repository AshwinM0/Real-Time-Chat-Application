import { useCallback, useEffect } from 'react'
import toast from 'react-hot-toast'
import useConversation from '../zustand/useConversation'
import { useAuthContext } from '../context/AuthContext'
import { useSocketContext } from '../context/SocketContext'
import { API_URL } from '../config'

// Loads the unread counts from the server: when the app starts, and after every
// reconnect, because messages that arrive while the socket is down are saved but
// never pushed. In between, useListenMessages adds to them as messages arrive live.
// Used in Home, which stays mounted the whole time you're logged in.
const useUnreadCounts = () => {
    const setUnread = useConversation((state) => state.setUnread)
    const { expireSession } = useAuthContext()
    const { socket } = useSocketContext()

    const loadUnread = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/api/messages/unread`, {
                credentials : 'include'
            })

            if(res.status === 401) return expireSession()

            const data = await res.json()

            if(data.error) throw new Error(data.error)

            setUnread(data)

        } catch(e) {
            toast.error(e.message)
        }
    }, [expireSession, setUnread])

    useEffect(() => {
        loadUnread()
    }, [loadUnread])

    // A separate effect, so the socket appearing doesn't load the counts a second time.
    // "reconnect" is emitted by the Manager (socket.io), which handles the retrying.
    useEffect(() => {
        const manager = socket?.io
        manager?.on("reconnect", loadUnread)
        return () => manager?.off("reconnect", loadUnread)
    }, [socket, loadUnread])
}

export default useUnreadCounts
