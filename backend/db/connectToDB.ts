import mongoose from "mongoose";
import { errorMessage } from "../utils/errorMessage.ts";

const connectToDB = async (uri: string) => {
    try {
        await mongoose.connect(uri)
        console.log("Connected to DB")
    } catch(e) {
        // Carrying on without a database would make every request wait 10 seconds
        // and fail. Stop instead, with the real reason.
        console.error("Could not connect to MongoDB: " + errorMessage(e))
        process.exit(1)
    }
}

export default connectToDB;
