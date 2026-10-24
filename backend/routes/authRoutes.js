import express from "express";
import { login, logout, signUp } from "../controllers/authController.js";


// limits: the rate limiters from createRateLimits().
const authRoutes = ({ loginByIp, loginByUser, signupByIp }) => {
    const router = express.Router()

    // Per address first, so a request it refuses doesn't count against the username.
    router.post("/login", loginByIp, loginByUser, login)

    router.post('/signup', signupByIp, signUp)

    router.post('/logout', logout)

    return router
}

export default authRoutes;
