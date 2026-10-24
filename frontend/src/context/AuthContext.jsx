import { createContext, useCallback, useContext, useEffect, useState } from "react";
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

    // Keep every tab on the same login. When another tab changes localStorage, the
    // browser fires "storage" here (never in the tab that made the change). Without
    // this, logging out in one tab would leave the others showing the chat. Logging
    // in as someone else would leave them showing the old user while their requests
    // use the new cookie.
    useEffect(() => {
        const onStorage = (e) => {
            if (e.key !== "chat-user") return
            setAuthUser(e.newValue ? JSON.parse(e.newValue) : null)
        }
        window.addEventListener("storage", onStorage)
        return () => window.removeEventListener("storage", onStorage)
    }, [])

return <AuthContext.Provider value={{authUser, setAuthUser, expireSession}}>
    { children }
</AuthContext.Provider>

}