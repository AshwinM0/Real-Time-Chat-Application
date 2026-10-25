import { useState } from 'react'
import { useAuthContext } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { API_URL } from '../config'
import type { ApiError, LogoutResponse } from '../types'
import { errorMessage } from '../utils/errorMessage'
import { isApiError, readJson } from '../utils/json'

const useLogout = () => {
  const [loading, setLoading] = useState(false)
  const {setAuthUser} = useAuthContext()

  const logout = async () => {
    setLoading(true)

    try {
        const res = await fetch(`${API_URL}/api/auth/logout`, {
            method : "POST",
            credentials: 'include',
            headers: {"Content-Type" : "application/json"}
        })
        const data = await readJson<LogoutResponse | ApiError>(res)

        if(isApiError(data)) {
            throw new Error(data.error)
        }

        localStorage.removeItem("chat-user")
        setAuthUser(null)

    } catch(e) {
        toast.error(errorMessage(e))
    } finally{
        setLoading(false)
    }


  }

  return {loading, logout}
}

export default useLogout
