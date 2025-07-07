import mongoose, { Schema } from "mongoose";

const clientServiceRequestSchema = new Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        enum: [
            "e-commerce", "restaurant", "hotel", "portfolio", "custom",
            "business", "agency", "education", "healthcare",
            "finance", "entertainment", "other"
        ],
        default: "custom"
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    features: {
        type: [String],
        default: []
    },
    budget: {
        type: Number,
        min: 0
    },
    deliveryDeadline: {
        type: Date
    },
    attachments: {
        type: [{
            url: {
                type: String,
                required: true
            },
            publicId: {
                type: String,
                required: true
            },
            resourceType: {
                type: String,
                enum: ["image", "video", "raw", "auto"],
                required: true
            },
            uploadedAt: {
                type: Date,
                default: Date.now
            }
        }],
        default: []
    },

    status: {
        type: String,
        enum: ["pending", "under-review", "approved", "declined", "completed"],
        default: "pending"
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: "Client",
        required: true
    }
}, {
    timestamps: true
});

const ClientServiceRequest = mongoose.model("ClientServiceRequest", clientServiceRequestSchema);
export default ClientServiceRequest;
