import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const clientSchema = new Schema({
    fullName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    phone: {
        type: String,
        required: true,
        unique: true
    },
    role: {
        type: String,
        enum: ["client", "admin"], // Adjusted roles for client model
        default: "client"
    },
    profileImage: {
        type: String,
        default: "default-profile.png"
    },
    address: {
        country: String,
        city: String,
        street: String
    },
    status: {
        type: String,
        enum: ["active", "inactive", "banned", "pending"],
        default: "active"
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    phoneVerificationToken: {
        type: String
    },
    phoneVerificationExpires: {
        type: Date
    },
    phoneVerificationAttempts: {
        type: Number,
        default: 0
    },
    isPhoneVerified: {
        type: Boolean,
        default: false
    },
    verificationToken: {
        type: String
    },
    resetPasswordToken: {
        type: String
    },
    resetPasswordExpires: {
        type: Date
    },
    refreshToken: {
        type: String
    }
}, { timestamps: true });

// Hash password before saving
clientSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

// Compare password
clientSchema.methods.comparePassword = async function (password) {
    return await bcrypt.compare(password, this.password);
};

// Generate access token
clientSchema.methods.generateAccessToken = function () {
    return jwt.sign(
        {
            _id: this._id,
            email: this.email,
            fullName: this.fullName,
            role: this.role
        },
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "1d"
        }
    );
};

// Generate refresh token
clientSchema.methods.generateRefreshToken = function () {
    return jwt.sign(
        { _id: this._id },
        process.env.REFRESH_TOKEN_SECRET,
        {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d"
        }
    );
};

const Client = mongoose.model("Client", clientSchema);

export default Client;