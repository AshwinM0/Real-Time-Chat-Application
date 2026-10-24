import toast from "react-hot-toast"
import { useAuthContext } from "../context/AuthContext"
import { useState } from "react"
import { API_URL } from "../config"
import type { ApiError, User } from "../types"
import { errorMessage } from "../utils/errorMessage"
import { isApiError, readJson } from "../utils/json"
import showRateLimit from "../utils/showRateLimit"

const useLogin = () => {


    const [loading, setLoading] = useState(false)
    const {setAuthUser} = useAuthContext()

    const login = async(username: string, password: string) => {
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

            const data = await readJson<User | ApiError>(res)

            if(isApiError(data)) {
                throw new Error(data.error)
            }

            localStorage.setItem("chat-user", JSON.stringify(data))
            setAuthUser(data)

        } catch(e) {
            toast.error(errorMessage(e))
        } finally {
            setLoading(false)
        }

    }

    return {loading, login}
}

export default useLogin

function handleInputErrors(username: string, password: string) {
    if(!username || !password) {
        toast.error("Please fill in all the fields!")
        return false;
    }

    return true
}
