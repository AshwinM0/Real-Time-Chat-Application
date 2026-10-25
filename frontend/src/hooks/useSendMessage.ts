import { useRef, useState } from 'react'
import useConversation from '../zustand/useConversation'
import toast from 'react-hot-toast'
import { useAuthContext } from '../context/AuthContext'
import { API_URL } from '../config'
import type { ApiError, ChatMessage } from '../types'
import { errorMessage } from '../utils/errorMessage'
import { isApiError, readJson } from '../utils/json'
import showRateLimit from '../utils/showRateLimit'

// A new id for a message: 128 random bits, as hex. crypto.randomUUID() would do,
// but browsers only offer it over HTTPS and on localhost, and the app also runs
// over plain HTTP, for example on a phone on the same network.
const newMessageId = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("")

// The last message that wasn't sent: who to, its text, and the id it went with.
interface Unsent {
    to: string
    text: string
    id: string
}

const useSendMessage = () => {

    const [loading, setLoading] = useState(false)
    const {addMessage, selectedConversation} = useConversation()
    const { expireSession } = useAuthContext()
    // A send can fail after the server saved the message, when only its answer was
    // lost. Sending the same text to the same person again is then a retry, so it
    // keeps the id, and the server returns the message it saved instead of saving
    // it twice. Different text, or someone else, is a new message with a new id.
    const unsent = useRef<Unsent | null>(null)

    // Resolves to true once the message is sent, so MessageInput only clears it then.
    const sendMessage = async (message: string): Promise<boolean> => {
        // The input only shows inside an open chat, so there's always someone to send to.
        if(!selectedConversation) return false
        const to = selectedConversation._id
        const last = unsent.current
        const clientMessageId = last && last.to === to && last.text === message ? last.id : newMessageId()
        unsent.current = { to, text: message, id: clientMessageId }
        setLoading(true)
        try {

            const res = await fetch(`${API_URL}/api/messages/send/${to}`, {
                method: "POST",
                headers: {
                    'Content-Type' : 'application/json'
                },
                credentials : 'include',
                body : JSON.stringify({message, clientMessageId})
            })

            if(res.status === 401) {
                expireSession()
                return false
            }

            // Sending too fast.
            if(res.status === 429) {
                await showRateLimit(res)
                return false
            }

            const data = await readJson<ChatMessage | ApiError>(res)

            if(isApiError(data)) throw new Error(data.error)

            unsent.current = null
            addMessage(data)
            return true

        } catch(e) {
            toast.error(errorMessage(e))
            return false
        } finally {
            setLoading(false)
        }


    }

    return {loading, sendMessage}
}

export default useSendMessage
