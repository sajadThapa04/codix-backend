import mongoose, { Schema } from "mongoose";

// Pricing tier schema (embedded in the main pricing schema)
const tierSchema = new Schema({
    name: {
        type: String,
        required: true, // e.g., Basic, Standard, Premium
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    features: {
        type: [String], // Feature list per tier
        default: []
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    deliveryTimeInDays: {
        type: Number,
        default: 7
    },
    isPopular: {
        type: Boolean,
        default: false
    }
}, { _id: false }); // Prevent auto _id generation for subdocs

const pricingSchema = new Schema({
    serviceId: {
        type: Schema.Types.ObjectId,
        ref: "Services",
        required: true
    },
    tiers: {
        type: [tierSchema], // Multiple pricing tiers
        required: true,
        validate: v => Array.isArray(v) && v.length > 0
    },
    currency: {
        type: String,
        default: "USD"
    },
    status: {
        type: String,
        enum: ["active", "inactive"],
        default: "active"
    }
}, { timestamps: true });

const Pricing = mongoose.model("Pricing", pricingSchema);

export default Pricing;
