import { createContext, useCallback, useContext, useState } from "react";
import toast from "react-hot-toast";

export const AuthContext = createContext()

export const useAuthContext = () => {
    return useContext(AuthContext)
}

export const AuthContextProvider = ({ children }) => {
    const [authUser, setAuthUser] = useState(JSON.parse(localStorage.getItem("chat-user")) || null)

    // Call when the server answers 401: the saved user no longer has a valid cookie.
    // Clearing it sends the app back to the login page. The fixed toast id stops
    // parallel failing requests from stacking up duplicate toasts.
    const expireSession = useCallback(() => {
        localStorage.removeItem("chat-user")
        setAuthUser(null)
        toast.error("Your session has expired. Please log in again.", { id: "session-expired" })
    }, [])

return <AuthContext.Provider value={{authUser, setAuthUser, expireSession}}>
    { children }
</AuthContext.Provider>

}