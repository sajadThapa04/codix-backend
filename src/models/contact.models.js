import mongoose, { Schema } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
const contactSchema = new Schema({
    fullName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        index: true // 🔍 indexed for fast lookup
    },
    phone: {
        type: String,
        trim: true
    },
    country: {
        type: String,
        trim: true
    },
    subject: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true
        // Consider encryption here if sensitive data is expected
    },
    status: {
        type: String,
        enum: ["pending", "resolved", "closed"],
        default: "pending",
        index: true // 🔍 indexed for filtering
    },
    respondedBy: {
        type: Schema.Types.ObjectId,
        ref: "Admin",
        default: null
    },
    responseMessage: {
        type: String,
        default: "" // 🚫 avoids undefined
    },
    isArchived: {
        type: Boolean,
        default: false
    },
    ipAddress: {
        type: String,
        trim: true,
        default: "" // 🚫 avoids undefined
    },
    client: {
        type: Schema.Types.ObjectId,
        ref: "Client",
        default: null,
        index: true // 🔍 for filtering user-specific contacts
    }
}, {
    timestamps: true
});

contactSchema.plugin(mongoosePaginate);

const Contact = mongoose.model("Contact", contactSchema);

export default Contact;
