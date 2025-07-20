import mongoose, { Schema } from "mongoose";

const careerSchema = new Schema({
    // Basic Applicant Information
    fullName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },

    // Application Details
    positionApplied: {
        type: String,
        required: true
    },
    resume: {
        url: {
            type: String,
            required: true
        },
        publicId: {
            type: String,
            required: true
        }
    },
    coverLetter: {
        url: String,
        publicId: String
    },

    // Application Status
    status: {
        type: String,
        enum: ["Applied", "Under Review", "Interview", "Hired", "Rejected"],
        default: "Applied"
    },

    // System Fields
    source: {
        type: String,
        enum: ["Website", "LinkedIn", "Referral", "Job Fair", "Other"],
        default: "Website"
    }
}, {
    timestamps: true
});

// Indexes
careerSchema.index({ email: 1 });
careerSchema.index({ positionApplied: 1 });
careerSchema.index({ status: 1 });

const Career = mongoose.model("Career", careerSchema);

export default Career;