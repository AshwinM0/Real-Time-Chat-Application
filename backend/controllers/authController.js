import User from "../models/userModel.js"
import bcrypt from 'bcryptjs'
import generateTokenAndSetCookie from "../utils/generateToken.js"


//SIGNUP
export const signUp = async (req, res) => {

    try {
        const { fullName, username, password, confirmPassword, gender} = req.body

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
        console.log("ERROR in signup Controller" + e.message)
        res.status(500).json({error : "internal server error"})
    }
}


//LOGIN
export const login = async (req, res) => {
    
    try {
        const {username, password} = req.body;
        
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
        console.log("ERROR in login Controller"+ e.message)
        res.status(500).json({error : "internal server error"})
    }

}


//LOGOUT
export const logout = async (req, res) => {
    
    try {
        
        res.cookie("jwt", "", {maxAge : 0})
        res.status(200).json({message : "Logged out successfully"})

    } catch(e) {
        console.log("ERROR in login Controller"+ e.message)
        res.status(500).json({error : "internal server error"})
    }
}

