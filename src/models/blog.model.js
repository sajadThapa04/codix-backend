import mongoose, { Schema } from "mongoose";
import slugify from "slugify";
import readingTime from "reading-time";

const blogSchema = new Schema({
    title: {
        type: String,
        required: [true, "Blog title is required"],
        trim: true,
        maxlength: [200, "Title cannot be more than 200 characters"]
    },
    slug: {
        type: String,
        unique: true,
        index: true
    },
    content: {
        type: String,
        required: [true, "Blog content is required"],
        minlength: [100, "Content should be at least 100 characters long"]
    },
    excerpt: {
        type: String,
        maxlength: [300, "Excerpt cannot be more than 300 characters"]
    },
    author: {
        type: Schema.Types.ObjectId,
        ref: "Client",
        required: true
    },
    tags: {
        type: [String],
        validate: {
            validator: function (tags) {
                return tags.length <= 10;
            },
            message: "Cannot have more than 10 tags"
        }
    },
    category: {
        type: String,
        required: [true, "Category is required"],
        trim: true
    },
    readingTime: {
        type: String
    },
    likes: [{
        type: Schema.Types.ObjectId,
        ref: "Client"
    }],
    coverImage: {
        url: {
            type: String,
            default: ""
        },
        altText: {
            type: String,
            default: ""
        }
    },
    views: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ["draft", "published", "archived"],
        default: "draft"
    },
    featured: {
        type: Boolean,
        default: false
    },
    seoTitle: String,
    seoDescription: String,
    metaKeywords: [String]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Pre-save hook for slug generation
blogSchema.pre("save", function (next) {
    if (this.isModified("title")) {
        this.slug = slugify(this.title, {
            lower: true,
            strict: true,
            remove: /[*+~.()'"!:@]/g
        });
    }

    // Generate excerpt if not provided - ENSURE it's <= 300 chars
    if (!this.excerpt && this.content) {
        const rawExcerpt = this.content.substring(0, 300);
        // Remove any newlines and extra spaces
        this.excerpt = rawExcerpt.replace(/\s+/g, ' ').trim();
        // Ensure it's exactly 300 characters or less
        this.excerpt = this.excerpt.substring(0, 300);
    }

    // Calculate reading time
    if (this.isModified("content")) {
        this.readingTime = readingTime(this.content).text;
    }

    next();
});

// Add this to skip validation when fetching
blogSchema.set('validateBeforeSave', false);
// Indexes for better query performance
// Add this to your Blog model (schema)
blogSchema.index({
    title: "text",
    content: "text",
    tags: "text"
}, {
    weights: {
        title: 10,
        tags: 5,
        content: 1
    }
});
// For common query patterns
blogSchema.index({ status: 1, createdAt: -1 });
blogSchema.index({ author: 1, createdAt: -1 });
blogSchema.index({ category: 1, createdAt: -1 });
// Virtual for like count
blogSchema.virtual("likeCount").get(function () {
    return this.likes ? this.likes.length : 0;
});

// Method to increment views
blogSchema.methods.incrementViews = async function () {
    this.views += 1;
    await this.save();
};

// Method to add/remove like
blogSchema.methods.toggleLike = async function (clientId) {
    const index = this.likes.indexOf(clientId);

    if (index === -1) {
        this.likes.push(clientId);
    } else {
        this.likes.splice(index, 1);
    }

    await this.save();
    return this.likes;
};

const Blog = mongoose.model("Blog", blogSchema);

export default Blog;