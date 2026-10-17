import { useEffect } from "react"
import toast from "react-hot-toast"
import { useSocketContext } from "../context/SocketContext"
import { useAuthContext } from "../context/AuthContext"
import useConversation from "../zustand/useConversation"

// Subscribes to "newMessage" events from the server.
// Used in Home, which stays mounted the whole time you're logged in, so messages
// are caught even when no chat is open (Messages.jsx only exists while one is).
const useListenMessages = () => {
    const { socket } = useSocketContext()
    const { authUser } = useAuthContext()
    const myId = authUser?._id

    useEffect(() => {
        if (!socket) return

        // The server emits (message, sender): Socket.IO events can carry several arguments.
        const handleNewMessage = (message, sender) => {
            // getState() reads the store *now*, when the event arrives. If we read it
            // during render instead, this long-lived handler would keep using whatever
            // chat was open when it was registered.
            const { selectedConversation, addMessage, incrementUnread } = useConversation.getState()

            // Only appends if the message belongs to the open chat (see the store).
            addMessage(message)

            // Our own messages arrive here too (synced from our other tabs): never notify.
            const fromMe = message.senderId === myId
            const chatIsOpen = message.senderId === selectedConversation?._id
            if (!fromMe && !chatIsOpen) {
                incrementUnread(message.senderId)
                const text = message.message
                const preview = text.length > 60 ? text.slice(0, 60) + "…" : text
                toast(`${sender?.fullName ?? "New message"}: ${preview}`, { icon: "💬" })
            }
        }

        socket.on("newMessage", handleNewMessage)

        // Remove this exact handler when the socket changes or Home unmounts.
        // Forgetting socket.off() is the classic socket bug: handlers pile up and
        // each message gets processed two, three, four times.
        return () => socket.off("newMessage", handleNewMessage)
    }, [socket, myId])
}

export default useListenMessages
