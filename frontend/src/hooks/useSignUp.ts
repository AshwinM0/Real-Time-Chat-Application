import { useState } from 'react'
import toast from 'react-hot-toast'
import { useAuthContext } from '../context/AuthContext'
import { API_URL } from '../config'
import type { ApiError, Gender, User } from '../types'
import { errorMessage } from '../utils/errorMessage'
import { isApiError, readJson } from '../utils/json'
import showRateLimit from '../utils/showRateLimit'

// What the sign-up form collects. gender is "" until one is picked.
export interface SignUpInputs {
    fullName: string
    username: string
    password: string
    confirmPassword: string
    gender: Gender | ""
}

const useSignUp = () => {
  const [loading, setLoading] = useState(false)
  const {setAuthUser} = useAuthContext()

  const signup = async({fullName, username, password, confirmPassword, gender}: SignUpInputs) => {
    const success = handleInputErrors({fullName, username, password, confirmPassword, gender})

    if(!success) return;

    setLoading(true)
    try {
        const res = await fetch(`${API_URL}/api/auth/signup`, {
            method: "POST",
            headers: {"Content-Type" : "application/json"},
            // Without this the browser discards the jwt cookie the server sets on signup.
            credentials: 'include',
            body: JSON.stringify({fullName, username, password, confirmPassword, gender})
        })

        // Too many sign-ups from this address.
        if(res.status === 429) return showRateLimit(res)

        const data = await readJson<User | ApiError>(res);

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

  return { loading , signup }
}

export default useSignUp


function handleInputErrors({fullName, username, password, confirmPassword, gender}: SignUpInputs) {
    if(!fullName || !username || !password || !confirmPassword || !gender) {
        toast.error("Please fill in all the fields!")
        return false;
    }

    if(password != confirmPassword) {
        toast.error('Passwords do not match')
        return false;
    }

    if(password.length < 6) {
        toast.error('Password must be at least 6 characters')
        return false
    }

    return true
}
