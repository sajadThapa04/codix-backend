import mongoose, { Schema } from "mongoose";

const servicesSchema = new Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        enum: [
            "e-commerce development",
            "web development",
            "mobile app development",
            "SEO optimization",
            "graphic design",
            "content creation",
            "digital marketing",
            "UI/UX design",
            "branding",
            "video production",
            "copywriting",
            "custom solution",
            "business website",
            "portfolio showcase",
            "educational platform",
            "healthcare solution",
            "financial service",
            "entertainment platform",
            "restaurant website",
            "hotel booking system",
            "other"
        ],
        default: "business"
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
    price: {
        type: Number,
        required: true,
        min: 0
    },
    isCustomizable: {
        type: Boolean,
        default: true
    },
    deliveryTimeInDays: {
        type: Number,
        default: 7
    },
    tags: {
        type: [String],
        default: []
    },
    status: {
        type: String,
        enum: ["active", "inactive"],
        default: "active"
    },
    thumbnail: {
        type: String
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: "Admin",
        required: true
    }
}, {
    timestamps: true
});

const Services = mongoose.model("Services", servicesSchema);
export default Services;
