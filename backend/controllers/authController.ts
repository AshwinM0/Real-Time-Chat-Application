import bcrypt from 'bcryptjs'
import type { RequestHandler } from "express"
import type { ParamsDictionary } from "express-serve-static-core"
import type { Types } from "mongoose"
import User, { type UserFields } from "../models/userModel.ts"
import { disconnectSession } from "../socket/socket.ts"
import type { ErrorBody } from "../types.ts"
import { errorMessage } from "../utils/errorMessage.ts"
import generateTokenAndSetCookie from "../utils/generateToken.ts"
import { loginToken } from "../utils/loginToken.ts"
import revokeToken from "../utils/revokeToken.ts"
import { invalid, LoginBody, SignUpBody } from "../validation.ts"

// What signing up and logging in answer with: the user now logged in, which the
// frontend keeps.
interface LoggedInUser extends Pick<UserFields, "fullName" | "username" | "profilePic"> {
    _id: Types.ObjectId
}

// What logging out answers with.
interface LogoutBody {
    message: string
}


//SIGNUP
export const signUp: RequestHandler<ParamsDictionary, LoggedInUser | ErrorBody> = async (req, res) => {

    try {
        const input = SignUpBody.safeParse(req.body)
        if (!input.success) {
            return res.status(400).json(invalid(input.error))
        }
        const { fullName, username, password, confirmPassword, gender} = input.data

        if (password!= confirmPassword) {
            return res.status(400).json({error : "Passwords dont match"})
        }

        const user = await User.findOne({username});

        if(user) {
            return res.status(400).json({error : "Username already taken"})
        }

        const salt = await bcrypt.genSalt(10)
        const hashPass = await bcrypt.hash(password, salt)

        const boyPic = 'https://avatar.iran.liara.run/public/boy?username='+username
        const girlPic = 'https://avatar.iran.liara.run/public/girl?username='+username

        const newUser = new User({
            fullName,
            username,
            password : hashPass,
            gender,
            profilePic: gender=='male' ? boyPic : girlPic
        })

        if(newUser) {
            //Generate JWT Token
            generateTokenAndSetCookie(newUser._id, res)

            await newUser.save()

            res.status(201).json({
                _id: newUser._id,
                fullName: newUser.fullName,
                username: newUser.username,
                profilePic: newUser.profilePic
            })
        }
        else{
            res.status(400).json({error : "invalid user data"})
        }



    } catch(e) {
        console.log("ERROR in signup Controller" + errorMessage(e))
        res.status(500).json({error : "internal server error"})
    }
}


//LOGIN
export const login: RequestHandler<ParamsDictionary, LoggedInUser | ErrorBody> = async (req, res) => {

    try {
        const input = LoginBody.safeParse(req.body)
        if (!input.success) {
            return res.status(400).json(invalid(input.error))
        }
        const {username, password} = input.data;

        const user = await User.findOne({username})

        if(!user) {
            return res.status(400).json({error : "Invalid username"})
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password)

        if(!isPasswordCorrect) {
            return res.status(400).json({error : "Incorrect password"})
        }

        generateTokenAndSetCookie(user._id, res);

        res.status(200).json({
            _id : user._id,
            fullName : user.fullName,
            username : user.username,
            profilePic : user.profilePic
        })

    } catch(e) {
        console.log("ERROR in login Controller"+ errorMessage(e))
        res.status(500).json({error : "internal server error"})
    }

}


//LOGOUT
export const logout: RequestHandler<ParamsDictionary, LogoutBody | ErrorBody> = async (req, res) => {

    try {
        // Revoke the token itself, so a copy of the cookie stops working too, then
        // close the sockets it opened (every tab in this browser). Other logins are
        // untouched. With no valid token there's nothing to revoke, and logout
        // still succeeds.
        const jti = await revokeToken(loginToken(req))
        if(jti) disconnectSession(jti)

        res.cookie("jwt", "", {maxAge : 0})
        res.status(200).json({message : "Logged out successfully"})

    } catch(e) {
        console.log("ERROR in logout Controller"+ errorMessage(e))
        res.status(500).json({error : "internal server error"})
    }
}

