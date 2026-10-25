import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from "react";
import toast from "react-hot-toast";
import type { User } from "../types";
import { parseJson } from "../utils/json";

interface AuthContextValue {
    // The logged-in user, or null when logged out.
    authUser: User | null
    setAuthUser: (user: User | null) => void
    expireSession: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export const useAuthContext = (): AuthContextValue => {
    const context = useContext(AuthContext)
    if (!context) throw new Error("useAuthContext needs an AuthContextProvider around it")
    return context
}

// The user that useLogin or useSignUp saved as "chat-user", if any.
const savedUser = (json: string | null): User | null => json ? parseJson<User>(json) : null

export const AuthContextProvider = ({ children }: PropsWithChildren) => {
    const [authUser, setAuthUser] = useState(() => savedUser(localStorage.getItem("chat-user")))

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
        const onStorage = (e: StorageEvent) => {
            if (e.key !== "chat-user") return
            setAuthUser(savedUser(e.newValue))
        }
        window.addEventListener("storage", onStorage)
        return () => window.removeEventListener("storage", onStorage)
    }, [])

return <AuthContext.Provider value={{authUser, setAuthUser, expireSession}}>
    { children }
</AuthContext.Provider>

}
