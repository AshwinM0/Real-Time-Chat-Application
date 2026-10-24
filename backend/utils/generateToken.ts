import crypto from "crypto";
import type { Response } from "express";
import jwt from "jsonwebtoken";
import type { Types } from "mongoose";
import { jwtSecret } from "./verifyToken.ts";


const generateTokenAndSetCookie = (userId: Types.ObjectId | string, res: Response) => {
    const token = jwt.sign({ userId: userId.toString() }, jwtSecret(), {
        expiresIn: '15d',
        // Every login gets its own token id, so logging out can revoke this token
        // alone (see revokeToken.ts) without ending the user's other logins.
        jwtid: crypto.randomUUID()
    })

    res.cookie("jwt", token, {
        maxAge: 15*24*60*60*1000,
		httpOnly: true, // prevent XSS attacks cross-site scripting attacks
    })
}

export default generateTokenAndSetCookie;
