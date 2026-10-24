import crypto from "crypto";
import jwt from "jsonwebtoken";


const generateTokenAndSetCookie = (userId, res) => {
    const token = jwt.sign({userId}, process.env.JWT_SECRET, {
        expiresIn: '15d',
        // Every login gets its own token id, so logging out can revoke this token
        // alone (see revokeToken.js) without ending the user's other logins.
        jwtid: crypto.randomUUID()
    })

    res.cookie("jwt", token, {
        maxAge: 15*24*60*60*1000,
		httpOnly: true, // prevent XSS attacks cross-site scripting attacks
    })
}

export default generateTokenAndSetCookie;