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
            "e-commerce",
            "restaurant",
            "hotel",
            "portfolio",
            "custom",
            "business",
            "agency",
            "education",
            "healthcare",
            "finance",
            "entertainment",
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
