import type { RequestHandler } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import { loggedInUser } from "../middleware/protectRoute.ts";
import User, { type PublicUser, type PublicUserFields } from "../models/userModel.ts";
import type { ErrorBody } from "../types.ts";
import { errorMessage } from "../utils/errorMessage.ts";

export const getAllUsers: RequestHandler<ParamsDictionary, PublicUser[] | ErrorBody> = async (req, res) => {
    try {

        const loggedInUserId = loggedInUser(req)._id;

        const filteredUsers = await User.find({ _id : { $ne : loggedInUserId}}).select<PublicUserFields>("-password")

        res.status(200).json(filteredUsers)

    } catch(e) {
        console.log("Error in userController " + errorMessage(e))
        res.status(500).json({error : 'Internal Server Error'})
    }
}
