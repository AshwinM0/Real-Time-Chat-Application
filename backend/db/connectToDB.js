import mongoose from "mongoose";

const connectToDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_DB_URI)
        console.log("Connected to DB")
    } catch(e) {
        // Carrying on without a database would make every request wait 10 seconds
        // and fail. Stop instead, with the real reason.
        console.error("Could not connect to MongoDB: " + e.message)
        process.exit(1)
    }
}

export default connectToDB;
