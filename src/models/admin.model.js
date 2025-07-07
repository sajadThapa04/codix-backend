import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const adminSchema = new Schema({
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
        minlength: 8
    },
    refreshToken: {
        type: String,
        select: false // Never returned in queries unless explicitly requested
    },
    resetToken: String,
    resetTokenExpires: Date,
    role: {
        type: String,
        enum: [
            "superadmin", "admin", "moderator", "client"
        ],
        default: "admin"
    },
    permissions: {
        // Core Site Management
        manageServices: { type: Boolean, default: false },
        managePortfolio: { type: Boolean, default: false },
        manageClients: { type: Boolean, default: false },
        manageProjects: { type: Boolean, default: false },

        // Team & Content
        manageTeam: { type: Boolean, default: false },
        manageTestimonials: { type: Boolean, default: false },
        manageBlog: { type: Boolean, default: false },

        // Communication / CRM
        manageLeads: { type: Boolean, default: false },
        manageContacts: { type: Boolean, default: false },
        sendBulkEmails: { type: Boolean, default: false },

        // Finance
        manageInvoices: { type: Boolean, default: false },
        managePayments: { type: Boolean, default: false },
        managePlans: { type: Boolean, default: false },

        // Internal/DevOps
        manageDeployments: { type: Boolean, default: false },
        accessLogs: { type: Boolean, default: false },
        manageBackups: { type: Boolean, default: false },

        // Admin & Role Control
        assignRoles: { type: Boolean, default: false },
        managePermissions: { type: Boolean, default: false },
        viewActivityLogs: { type: Boolean, default: false },

        // Security / Compliance
        manageSecuritySettings: { type: Boolean, default: false },
        managePrivacySettings: { type: Boolean, default: false },

        // Global Settings
        manageSiteSettings: { type: Boolean, default: false }
    }
    ,
    lastLogin: Date,
    loginIP: String,
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    strict: true
});

// Password hashing middleware (keep existing)
adminSchema.pre("save", async function (next) {
    if (!this.isModified("password"))
        return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// Compare password
adminSchema.methods.comparePassword = async function (password) {
    return await bcrypt.compare(password, this.password);
};

// Generate access token method (keep existing)
adminSchema.methods.generateAccessToken = function () {
    return jwt.sign({
        _id: this._id,
        role: this.role,
        email: this.email
    }, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m"
    });
};

// NEW: Generate refresh token method
adminSchema.methods.generateRefreshToken = function () {
    return jwt.sign({
        _id: this._id
    }, process.env.REFRESH_TOKEN_SECRET, {
        expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d"
    });
};



const Admin = mongoose.model("Admin", adminSchema);

export default Admin;
