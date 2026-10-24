import React, { useState } from 'react'
import useConversation from '../zustand/useConversation'
import toast from 'react-hot-toast'
import { useAuthContext } from '../context/AuthContext'
import { API_URL } from '../config'
import showRateLimit from '../utils/showRateLimit'

const useSendMessage = () => {

    const [loading, setLoading] = useState(false)
    const {addMessage, selectedConversation} = useConversation()
    const { expireSession } = useAuthContext()

    // Resolves to true once the message is sent, so MessageInput only clears it then.
    const sendMessage = async (message) => {
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

            if(res.status === 401) return expireSession()

            // Sending too fast.
            if(res.status === 429) return showRateLimit(res)

            const data = await res.json()

            if(data.error) throw new Error(data.error)

            addMessage(data)
            return true

        } catch(e) {
            console.log(e.error)
            toast.error(e.message)
        } finally {
            setLoading(false)
        }

        
    }
  
    return {loading, sendMessage}
}

export default useSendMessage
