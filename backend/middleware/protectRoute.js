import getUserFromToken from "../utils/getUserFromToken.js";

const protectRoute = async (req, res, next) => {
    try {
        const { user, error } = await getUserFromToken(req.cookies.jwt)

        // Every auth failure is a 401, which the frontend treats as "session expired".
        if(error) {
            return res.status(401).json({error : "Unauthorized - " + error})
        }

        req.user = user

        next()

    } catch(e) {
        console.log("Error in protectRoute middleware: "+ e.message)
        res.status(500).json({error : "Internal Server Error"})
    }
}

export default protectRoute;
