import mongoose from "mongoose";
import { db_name } from "../constants.js";
import dotenv from "dotenv";
import { ApiError } from "../utils/ApiError.utils.js";

dotenv.config({
    path: "./.env"
});

if (!process.env.DB_CONNECTION) {
    throw new ApiError(500, "DB_CONNECTION string is missing in environment variables");
}

const db_connection = async () => {
    try {
        const connection_host = await mongoose.connect(`${process.env.DB_CONNECTION}/${db_name}`, {
        });
        console.log(`Mongoose is connected on ${connection_host.connection.host}`);
    } catch (error) {
        console.error("MongoDB connection error:", error);
        throw new ApiError(500, "Failed to connect to MongoDB");
    }
};

export default db_connection;
