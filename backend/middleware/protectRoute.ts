import type { NextFunction, Request, Response } from "express";
import type { PublicUser } from "../models/userModel.ts";
import type { ErrorBody } from "../types.ts";
import { errorMessage } from "../utils/errorMessage.ts";
import getUserFromToken from "../utils/getUserFromToken.ts";
import { loginToken } from "../utils/loginToken.ts";

declare module "express-serve-static-core" {
    interface Request {
        // The logged-in user, set by protectRoute. Only the routes behind it have one.
        user?: PublicUser
    }
}

const protectRoute = async (req: Request, res: Response<ErrorBody>, next: NextFunction) => {
    try {
        const { user, error } = await getUserFromToken(loginToken(req))

        // Every auth failure is a 401, which the frontend treats as "session expired".
        if(!user) {
            return res.status(401).json({error : "Unauthorized - " + error})
        }

        req.user = user

        next()

    } catch(e) {
        console.log("Error in protectRoute middleware: "+ errorMessage(e))
        res.status(500).json({error : "Internal Server Error"})
    }
}

// The logged-in user, for a handler behind protectRoute. Anywhere else there is
// none, and this throws, which the handler answers as a 500, rather than letting
// the request carry on as nobody.
export const loggedInUser = (req: Request): PublicUser => {
    if(!req.user) throw new Error("No logged-in user: is this route behind protectRoute?")
    return req.user
}

export default protectRoute;
