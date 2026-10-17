import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useAuthContext } from "../context/AuthContext"


const useGetConversations = () => {

    const [loading, setLoading] = useState(false)
    const [conversations, setConversations] = useState([])
    const { expireSession } = useAuthContext()

    useEffect(() => {
        const getConversations = async () => {
            setLoading(true)
            try {

                const res = await fetch("http://localhost:5000/api/users", {
                    credentials: 'include'
                })

                if(res.status === 401) return expireSession()

                const data = await res.json()

                if(data.error) {
                    throw new Error(data.error)
                }

                setConversations(data)

            } catch(e) {
                toast.error(e.message)
            } finally {
                setLoading(false)
            }
        }

        getConversations();
    }, [expireSession])

    return {loading, conversations}
}

export default useGetConversations
