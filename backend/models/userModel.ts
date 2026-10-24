import mongoose, { type HydratedDocument, type InferSchemaType } from "mongoose";

const userSchema = new mongoose.Schema( {
    fullName : {
        type:String,
        required:true
    },
    username : {
        type : String,
        required : true,
        unique : true
    },
    password : {
        type : String,
        required : true,
        minlength : 6
    },
    gender : {
        type : String,
        required : true,
        enum : ['male', 'female']
    },
    profilePic : {
        type : String,
        default: " "
    }
}, {timestamps : true})

// A user's fields, worked out from the schema above.
export type UserFields = InferSchemaType<typeof userSchema>

// A user without their password hash, loaded with select<PublicUserFields>("-password").
// It's what the API sends about other users, and what protectRoute puts on req.user,
// so reading .password from one is a type error, just as it's undefined at runtime.
export type PublicUserFields = Omit<UserFields, "password">
export type PublicUser = HydratedDocument<PublicUserFields>

const User = mongoose.model("User", userSchema)

export default User;
