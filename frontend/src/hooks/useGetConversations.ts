import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useAuthContext } from "../context/AuthContext"
import { API_URL } from "../config"
import type { ApiError, User } from "../types"
import { errorMessage } from "../utils/errorMessage"
import { isApiError, readJson } from "../utils/json"


const useGetConversations = () => {

    const [loading, setLoading] = useState(false)
    const [conversations, setConversations] = useState<User[]>([])
    const { expireSession } = useAuthContext()

    useEffect(() => {
        const getConversations = async () => {
            setLoading(true)
            try {

                const res = await fetch(`${API_URL}/api/users`, {
                    credentials: 'include'
                })

                if(res.status === 401) return expireSession()

                const data = await readJson<User[] | ApiError>(res)

                if(isApiError(data)) {
                    throw new Error(data.error)
                }

                setConversations(data)

            } catch(e) {
                toast.error(errorMessage(e))
            } finally {
                setLoading(false)
            }
        }

        getConversations();
    }, [expireSession])

    return {loading, conversations}
}

export default useGetConversations
