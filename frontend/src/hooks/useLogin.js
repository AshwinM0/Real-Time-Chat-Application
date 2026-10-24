import toast from "react-hot-toast"
import { useAuthContext } from "../context/AuthContext"
import { useState } from "react"
import { API_URL } from "../config"
import showRateLimit from "../utils/showRateLimit"

const useLogin = () => {


    const [loading, setLoading] = useState(false)
    const {setAuthUser} = useAuthContext()

    const login = async(username, password) => {
        const success = handleInputErrors(username, password)

        if(!success) return;
        
        setLoading(true)

        try {
            
            const res = await fetch(`${API_URL}/api/auth/login`, {
                method : "POST",
                headers : {"Content-Type" : "application/json"},
                credentials: 'include',
                body : JSON.stringify({
                    "username" : username,
                    "password" : password
                })
            })

            // Too many failed logins, from this address or for this username.
            if(res.status === 429) return showRateLimit(res)

            const data = await res.json()

            if(data.error) {
                throw new Error(data.error)
            }

            localStorage.setItem("chat-user", JSON.stringify(data))
            setAuthUser(data)
            
        } catch(e) {
            toast.error(e.message)
        } finally {
            setLoading(false)
        }

    }

    return {loading, login}
}

export default useLogin

function handleInputErrors(username, password) {
    if(!username || !password) {
        toast.error("Please fill in all the fields!")
        return false;
    }

    return true
}