import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import useConversation from '../zustand/useConversation'
import { useAuthContext } from '../context/AuthContext'
import { useSocketContext } from '../context/SocketContext'

const useGetMessages = () => {
    const [loading, setLoading] = useState(false)
    const {messages, setMessages, selectedConversation} = useConversation()
    const { expireSession } = useAuthContext()
    const { socket } = useSocketContext()

    useEffect(() => {
        const getMessages = async () => {
            setLoading(true)
            try {
                let res = await fetch(`http://localhost:5000/api/messages/${selectedConversation._id}`, {
                    credentials : 'include'
                });

                if(res.status === 401) return expireSession()

                const data = await res.json()

                if(data.error) throw new Error(data.error);

                setMessages(data)

            } catch(e) {
                toast.error(e.message)
            } finally {
                setLoading(false)
            }
        }

        if(!selectedConversation?._id) return

        getMessages();

        // While the connection was down, messages were still saved to MongoDB but
        // never pushed to us. After Socket.IO reconnects, refetch the open chat to
        // fill the gap. "reconnect" is emitted by the Manager (socket.io), the object
        // that owns the underlying connection and handles the retrying.
        const manager = socket?.io
        manager?.on("reconnect", getMessages)
        return () => manager?.off("reconnect", getMessages)
    }, [selectedConversation?._id, setMessages, expireSession, socket])

    
    return {loading, messages}
}

export default useGetMessages
