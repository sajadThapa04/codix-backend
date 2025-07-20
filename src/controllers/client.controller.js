import asyncHandler from "../utils/asyncHandler.utils.js";
import { ApiError } from "../utils/ApiError.utils.js";
import ApiResponse from "../utils/ApiResponse.utils.js";
import Client from "../models/client.model.js";
import jwt from "jsonwebtoken";
import { sendVerificationEmail, sendPasswordResetEmail } from "../utils/emailService.js";
import { isPasswordStrong, isEmailValid, isPhoneValid, areRequiredFieldsProvided } from "../utils/validator.utils.js";
import mongoose from "mongoose";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.utils.js";
import logger from "../utils/logger.utils.js";

// Generate access and refresh tokens
const generateAccessAndRefreshToken = async (clientId) => {
    try {
        const client = await Client.findById(clientId);
        const accessToken = client.generateAccessToken();
        const refreshToken = client.generateRefreshToken();
        client.refreshToken = refreshToken;
        await client.save({ validateBeforeSave: false });
        return { accessToken, refreshToken };
    } catch (error) {
        logger.error(`Error in generateAccessAndRefreshToken: ${error.message}`, { stack: error.stack });
        throw new ApiError(500, "Failed to generate access and refresh tokens");
    }
};

// Register a new client
const registerClient = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        logger.info("Starting registerClient process");

        const { fullName, email, password, phone } = req.body;

        // Validation
        if (!areRequiredFieldsProvided([fullName, email, password, phone])) {
            throw new ApiError(400, "All fields are required");
        }

        if (!isEmailValid(email)) {
            throw new ApiError(400, "Invalid email format");
        }

        if (!isPhoneValid(phone)) {
            throw new ApiError(400, "Invalid phone number");
        }

        if (!isPasswordStrong(password)) {
            throw new ApiError(400, "Password must be at least 6 characters with uppercase, lowercase, number and special character");
        }

        // Check if client exists
        const existingClient = await Client.findOne({ email }).session(session);
        if (existingClient) {
            throw new ApiError(409, "Email already registered");
        }

        const existingPhone = await Client.findOne({ phone }).session(session);
        if (existingPhone) {
            throw new ApiError(409, "Phone number already registered");
        }

        // Create client
        const client = await Client.create([{
            fullName,
            email,
            password,
            phone,
            role: "client" // Default role
        }], { session });

        // Generate verification token
        const verificationToken = client[0].generateAccessToken();
        client[0].verificationToken = verificationToken;
        await client[0].save({ validateBeforeSave: false, session });

        // Send verification email
        await sendVerificationEmail(email, verificationToken);

        await session.commitTransaction();

        const createdClient = await Client.findById(client[0]._id).select("-password -refreshToken -verificationToken");

        res.status(201).json(
            new ApiResponse(201, createdClient, "Client registered successfully. Please verify your email.")
        );
    } catch (error) {
        await session.abortTransaction();
        logger.error(`Error in registerClient: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) throw error;
        if (error.name === "ValidationError") throw new ApiError(400, error.message);
        if (error.code === 11000) throw new ApiError(400, "Duplicate field value");

        throw new ApiError(500, "Failed to register client");
    } finally {
        session.endSession();
    }
});

// Verify client email
const verifyClientEmail = asyncHandler(async (req, res) => {
    const { token } = req.query;

    if (!token) {
        throw new ApiError(400, "Verification token is required");
    }

    try {
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const client = await Client.findById(decodedToken._id);

        if (!client) {
            throw new ApiError(404, "Client not found");
        }

        if (client.isEmailVerified) {
            throw new ApiError(400, "Email already verified");
        }

        client.isEmailVerified = true;
        client.verificationToken = undefined;
        await client.save({ validateBeforeSave: false });

        res.status(200).json(new ApiResponse(200, {}, "Email verified successfully"));
    } catch (error) {
        logger.error(`Error in verifyClientEmail: ${error.message}`, { stack: error.stack });

        if (error.name === "JsonWebTokenError") {
            throw new ApiError(400, "Invalid or expired token");
        }
        throw error;
    }
});

// Login client
const loginClient = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new ApiError(400, "Email and password are required");
    }

    try {
        const client = await Client.findOne({ email });
        if (!client) {
            throw new ApiError(401, "Invalid credentials");
        }

        if (!client.isEmailVerified) {
            throw new ApiError(403, "Please verify your email first");
        }

        const isPasswordValid = await client.comparePassword(password);
        if (!isPasswordValid) {
            throw new ApiError(401, "Invalid credentials");
        }

        const { accessToken, refreshToken } = await generateAccessAndRefreshToken(client._id);
        const loggedInClient = await Client.findById(client._id).select("-password -refreshToken -verificationToken");

        const options = {
            httpOnly: true,
            secure: true,
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",  // Allow cross-origin cookies in prod

        };

        res.status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", refreshToken, options)
            .json(new ApiResponse(200, {
                client: loggedInClient,
                accessToken,
                refreshToken
            }, "Client logged in successfully"));
    } catch (error) {
        logger.error(`Error in loginClient: ${error.message}`, { stack: error.stack });
        throw new ApiError(error.statusCode || 500, error.message || "Login failed");
    }
});

// Logout client
const logoutClient = asyncHandler(async (req, res) => {
    await Client.findByIdAndUpdate(
        req.client._id,
        { $unset: { refreshToken: 1 } },
        { new: true }
    );

    const options = {
        httpOnly: true,
        secure: true,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",  // Allow cross-origin cookies in prod

    };

    res.status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "Client logged out successfully"));
});

// Refresh access token
const refreshClientAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized request");
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
        const client = await Client.findById(decodedToken._id);

        if (!client || incomingRefreshToken !== client.refreshToken) {
            throw new ApiError(401, "Invalid refresh token");
        }

        const { accessToken, refreshToken } = await generateAccessAndRefreshToken(client._id);

        const options = {
            httpOnly: true,
            secure: true,
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",  // Allow cross-origin cookies in prod

        };

        res.status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", refreshToken, options)
            .json(new ApiResponse(200, { accessToken, refreshToken }, "Access token refreshed"));
    } catch (error) {
        logger.error(`Error in refreshClientAccessToken: ${error.message}`, { stack: error.stack });
        throw new ApiError(500, error.message || "Failed to refresh token");
    }
});

// Get current client
const getCurrentClient = asyncHandler(async (req, res) => {
    const client = req.client;
    if (!client) {
        throw new ApiError(404, "Client not found");
    }

    res.status(200).json(new ApiResponse(200, client, "Current client retrieved"));
});

// Update client details
const updateClientDetails = asyncHandler(async (req, res) => {
    const { fullName, email, phone } = req.body;

    if (!fullName && !email && !phone) {
        throw new ApiError(400, "At least one field is required");
    }

    if (email) {
        const existingClient = await Client.findOne({ email });
        if (existingClient && existingClient._id.toString() !== req.client._id.toString()) {
            throw new ApiError(409, "Email already in use");
        }
    }

    if (phone) {
        const existingPhone = await Client.findOne({ phone });
        if (existingPhone && existingPhone._id.toString() !== req.client._id.toString()) {
            throw new ApiError(409, "Phone already in use");
        }
    }

    const updatedClient = await Client.findByIdAndUpdate(
        req.client._id,
        { $set: { fullName, email, phone } },
        { new: true }
    ).select("-password -refreshToken -verificationToken");

    res.status(200).json(new ApiResponse(200, updatedClient, "Client updated"));
});

// Change client password
const changeClientPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
        throw new ApiError(400, "Both passwords are required");
    }

    const client = await Client.findById(req.client._id);
    if (!client) {
        throw new ApiError(404, "Client not found");
    }

    const isPasswordValid = await client.comparePassword(oldPassword);
    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid current password");
    }

    if (!isPasswordStrong(newPassword)) {
        throw new ApiError(400, "Password must be at least 6 characters with uppercase, lowercase, number and special character");
    }

    client.password = newPassword;
    await client.save({ validateBeforeSave: false });

    res.status(200).json(new ApiResponse(200, {}, "Password changed"));
});

// Request password reset
const requestClientPasswordReset = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        throw new ApiError(400, "Email is required");
    }

    const client = await Client.findOne({ email });
    if (!client) {
        throw new ApiError(404, "Client not found");
    }

    const resetToken = client.generateAccessToken();
    client.resetPasswordToken = resetToken;
    client.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await client.save({ validateBeforeSave: false });

    await sendPasswordResetEmail(email, resetToken);

    res.status(200).json(new ApiResponse(200, {}, "Reset email sent"));
});

// Reset password
const resetClientPassword = asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        throw new ApiError(400, "Token and password are required");
    }

    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const client = await Client.findById(decodedToken._id);

    if (!client || client.resetPasswordToken !== token || client.resetPasswordExpires < Date.now()) {
        throw new ApiError(400, "Invalid or expired token");
    }

    if (!isPasswordStrong(newPassword)) {
        throw new ApiError(400, "Password must be at least 6 characters with uppercase, lowercase, number and special character");
    }

    client.password = newPassword;
    client.resetPasswordToken = undefined;
    client.resetPasswordExpires = undefined;
    await client.save({ validateBeforeSave: false });

    res.status(200).json(new ApiResponse(200, {}, "Password reset"));
});

// Upload profile image
const uploadClientProfileImage = asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) {
        throw new ApiError(400, "Image file required");
    }

    const cloudinaryResponse = await uploadOnCloudinary(file.path);
    if (!cloudinaryResponse?.secure_url) {
        throw new ApiError(500, "Failed to upload image");
    }

    // Delete old image if exists
    if (req.client.profileImage && req.client.profileImage !== "default-profile.png") {
        try {
            const publicId = req.client.profileImage.split("/").pop().split(".")[0];
            await deleteFromCloudinary(publicId);
        } catch (error) {
            logger.error("Failed to delete old image", error);
        }
    }

    const client = await Client.findByIdAndUpdate(
        req.client._id,
        { profileImage: cloudinaryResponse.secure_url },
        { new: true }
    ).select("-password -refreshToken -verificationToken");

    res.status(200).json(new ApiResponse(200, client, "Profile image updated"));
});

// Update client address
const updateClientAddress = asyncHandler(async (req, res) => {
    const { country, city, street } = req.body;

    if (!country && !city && !street) {
        throw new ApiError(400, "At least one address field is required");
    }

    const updateFields = {};
    if (country) updateFields["address.country"] = country;
    if (city) updateFields["address.city"] = city;
    if (street) updateFields["address.street"] = street;

    const updatedClient = await Client.findByIdAndUpdate(
        req.client._id,
        { $set: updateFields },
        { new: true }
    ).select("-password -refreshToken -verificationToken");

    res.status(200).json(new ApiResponse(200, updatedClient, "Address updated"));
});

export {
    registerClient,
    verifyClientEmail,
    loginClient,
    logoutClient,
    refreshClientAccessToken,
    getCurrentClient,
    updateClientDetails,
    changeClientPassword,
    requestClientPasswordReset,
    resetClientPassword,
    uploadClientProfileImage,
    updateClientAddress
};