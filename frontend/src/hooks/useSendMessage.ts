import { useState } from 'react'
import useConversation from '../zustand/useConversation'
import toast from 'react-hot-toast'
import { useAuthContext } from '../context/AuthContext'
import { API_URL } from '../config'
import type { ApiError, ChatMessage } from '../types'
import { errorMessage } from '../utils/errorMessage'
import { isApiError, readJson } from '../utils/json'
import showRateLimit from '../utils/showRateLimit'

const useSendMessage = () => {

    const [loading, setLoading] = useState(false)
    const {addMessage, selectedConversation} = useConversation()
    const { expireSession } = useAuthContext()

    // Resolves to true once the message is sent, so MessageInput only clears it then.
    const sendMessage = async (message: string): Promise<boolean> => {
        // The input only shows inside an open chat, so there's always someone to send to.
        if(!selectedConversation) return false
        setLoading(true)
        try {

            const res = await fetch(`${API_URL}/api/messages/send/${selectedConversation._id}`, {
                method: "POST",
                headers: {
                    'Content-Type' : 'application/json'
                },
                credentials : 'include',
                body : JSON.stringify({message})
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
