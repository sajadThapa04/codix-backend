import asyncHandler from "../utils/asyncHandler.utils.js";
import jwt from "jsonwebtoken";
import Client from "../models/client.model.js";
import { ApiError } from "../utils/ApiError.utils.js";
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

// console.log(process.env.ACCESS_TOKEN_SECRET)

export const verifyJwt = asyncHandler(async (req, _, next) => {
    try {
        const token = req.cookies
            ?.accessToken || req.header("Authorization")
                ?.replace("Bearer ", "");

        if (!token) {
            throw new ApiError(401, "unauthorised request");
        }

        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const client = await Client.findById(
            decodedToken
                ?._id).select("-password -refreshToken");
        if (!client) {
            throw new ApiError(403, "Invalid access Token");
        }

        req.client = client;
        next();
    } catch (error) {
        throw new ApiError(
            401, error
            ?.message,
            "invalid access Token");
    }
});
