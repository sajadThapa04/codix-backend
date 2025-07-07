import asyncHandler from "../utils/asyncHandler.utils.js";
import { ApiError } from "../utils/ApiError.utils.js";
import ApiResponse from "../utils/ApiResponse.utils.js";
import Blog from "../models/blog.model.js";
import Client from "../models/client.model.js";
import mongoose from "mongoose";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.utils.js";
import logger from "../utils/logger.utils.js";

// Enhanced permission checking with Client model verification
const verifyBlogOwnership = async (clientId, blogId) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // 1. Verify client exists and is active
        const client = await Client.findById(clientId)
            .select("status")
            .session(session);

        if (!client) {
            throw new ApiError(404, "Client not found");
        }

        if (client.status !== "active") {
            throw new ApiError(403, "Client account is not active");
        }

        // 2. Verify blog exists and belongs to this client
        const blog = await Blog.findById(blogId)
            .select("author")
            .session(session);

        if (!blog) {
            throw new ApiError(404, "Blog not found");
        }

        if (blog.author.toString() !== clientId.toString()) {
            throw new ApiError(403, "Unauthorized: You don't own this blog");
        }

        await session.commitTransaction();
        return true;
    } catch (error) {
        await session.abortTransaction();
        logger.error(`Error in verifyBlogOwnership: ${error.message}`, { stack: error.stack });
        throw error;
    } finally {
        session.endSession();
    }
};

// Create a new blog post (automatically sets owner as current client)
const createBlog = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        logger.info("Starting createBlog process");

        // 1. Verify client exists and is active
        const client = await Client.findById(req.client._id)
            .select("status")
            .session(session);

        if (!client) {
            throw new ApiError(404, "Client not found");
        }

        if (client.status !== "active") {
            throw new ApiError(403, "Your account is not active");
        }

        const {
            title,
            content,
            tags,
            category,
            status = "draft",
            featured = false,
            seoTitle,
            seoDescription,
            metaKeywords
        } = req.body;

        // 2. Required fields validation
        if (!title || !content || !category) {
            logger.error("Missing required fields");
            throw new ApiError(400, "Title, content and category are required");
        }

        // 3. Validate tags
        if (tags && tags.length > 10) {
            logger.error("Too many tags");
            throw new ApiError(400, "Cannot have more than 10 tags");
        }

        // 4. Create blog with owner verification
        const blog = await Blog.create([{
            title,
            content,
            author: req.client._id, // Set owner to current client
            tags: tags || [],
            category,
            status,
            featured,
            seoTitle: seoTitle || title,
            seoDescription,
            metaKeywords
        }], { session });

        await session.commitTransaction();
        logger.info(`Blog created successfully by client ${req.client._id}: ${blog[0].title}`);

        res.status(201).json(
            new ApiResponse(201, blog[0], "Blog created successfully")
        );
    } catch (error) {
        await session.abortTransaction();
        logger.error(`Error in createBlog: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) {
            throw error;
        }
        if (error.name === "ValidationError") {
            throw new ApiError(400, error.message);
        }
        if (error.code === 11000) {
            throw new ApiError(409, "Blog with this title already exists");
        }
        throw new ApiError(500, error.message || "Failed to create blog");
    } finally {
        session.endSession();
    }
});

// Update blog post with ownership verification
const updateBlog = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        logger.info(`Starting updateBlog process for client ${req.client._id}`);

        const { blogId } = req.params;

        // 1. Validate blog ID
        if (!mongoose.Types.ObjectId.isValid(blogId)) {
            logger.error("Invalid blog ID");
            throw new ApiError(400, "Invalid blog ID");
        }

        // 2. Verify ownership
        await verifyBlogOwnership(req.client._id, blogId);

        // 3. Find blog
        const blog = await Blog.findById(blogId).session(session);
        if (!blog) {
            logger.error("Blog not found");
            throw new ApiError(404, "Blog not found");
        }

        // 4. Update fields
        const updatableFields = [
            "title", "content", "tags", "category",
            "status", "featured", "seoTitle",
            "seoDescription", "metaKeywords"
        ];

        updatableFields.forEach(field => {
            if (req.body[field] !== undefined) {
                blog[field] = req.body[field];
            }
        });

        // 5. Save updated blog
        await blog.save({ session });
        await session.commitTransaction();

        logger.info(`Blog updated successfully by owner ${req.client._id}: ${blog.title}`);

        res.status(200).json(
            new ApiResponse(200, blog, "Blog updated successfully")
        );
    } catch (error) {
        await session.abortTransaction();
        logger.error(`Error in updateBlog: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) {
            throw error;
        }
        if (error.name === "ValidationError") {
            throw new ApiError(400, error.message);
        }
        if (error.code === 11000) {
            throw new ApiError(409, "Blog with this title already exists");
        }
        throw new ApiError(500, error.message || "Failed to update blog");
    } finally {
        session.endSession();
    }
});

// Delete blog post with ownership verification
const deleteBlog = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        logger.info(`Starting deleteBlog process for client ${req.client._id}`);

        const { blogId } = req.params;

        // 1. Validate blog ID
        if (!mongoose.Types.ObjectId.isValid(blogId)) {
            logger.error("Invalid blog ID");
            throw new ApiError(400, "Invalid blog ID");
        }

        // 2. Verify ownership
        await verifyBlogOwnership(req.client._id, blogId);

        // 3. Find blog (don't delete yet so we can check cover image)
        const blog = await Blog.findById(blogId).session(session);
        if (!blog) {
            logger.error("Blog not found");
            throw new ApiError(404, "Blog not found");
        }

        // 4. Delete cover image from Cloudinary if it exists
        if (blog.coverImage.url) {
            try {
                const publicId = blog.coverImage.url.split('/').pop().split('.')[0];
                logger.info(`Attempting to delete cover image from Cloudinary with publicId: ${publicId}`);
                await deleteFromCloudinary(publicId);
                logger.info('Cover image deleted from Cloudinary successfully');
            } catch (cloudinaryError) {
                logger.error('Failed to delete cover image from Cloudinary', { error: cloudinaryError });
                // Continue with blog deletion even if image deletion fails
            }
        }

        // 5. Delete the blog
        await Blog.findByIdAndDelete(blogId).session(session);

        await session.commitTransaction();
        logger.info(`Blog deleted successfully by owner ${req.client._id}: ${blog.title}`);

        res.status(200).json(
            new ApiResponse(200, {}, "Blog deleted successfully")
        );
    } catch (error) {
        await session.abortTransaction();
        logger.error(`Error in deleteBlog: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, error.message || "Failed to delete blog");
    } finally {
        session.endSession();
    }
});
// Get all blog posts
const getAllBlogs = asyncHandler(async (req, res) => {
    try {
        logger.info("Fetching all blogs");

        // 1. Parse query parameters
        const {
            category,
            status = "published",
            author,
            featured,
            search,
            sortBy = "createdAt",
            sortOrder = "desc",
            page = 1,
            limit = 10
        } = req.query;

        // 2. Build query object
        const query = {};

        // Only show published blogs to non-authors
        if (!author || author !== req.client?._id.toString()) {
            query.status = "published";
        } else {
            if (status) query.status = status;
        }

        if (category) query.category = category;
        if (author) query.author = author;
        if (featured !== undefined) query.featured = featured === "true";

        if (search) {
            query.$or = [
                { title: { $regex: search, $options: "i" } },
                { content: { $regex: search, $options: "i" } },
                { tags: { $regex: search, $options: "i" } }
            ];
        }

        // 3. Build sort object
        const sort = {};
        sort[sortBy] = sortOrder === "desc" ? -1 : 1;

        // 4. Calculate pagination
        const skip = (page - 1) * limit;

        // 5. Execute query
        const blogs = await Blog.find(query)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .populate("author", "fullName profileImage")
            .select("-content"); // Don't send full content in list view

        const totalBlogs = await Blog.countDocuments(query);

        res.status(200).json(
            new ApiResponse(200, {
                blogs,
                total: totalBlogs,
                page: Number(page),
                pages: Math.ceil(totalBlogs / limit)
            }, "Blogs fetched successfully")
        );
    } catch (error) {
        logger.error(`Error in getAllBlogs: ${error.message}`, { stack: error.stack });
        throw new ApiError(500, error.message || "Failed to fetch blogs");
    }
});

// Get blog by ID or slug
const getBlogById = asyncHandler(async (req, res) => {
    try {
        logger.info("Fetching blog by ID or slug");

        const { blogId } = req.params;

        // 1. Find blog by ID or slug - disable validation for this query
        const query = mongoose.Types.ObjectId.isValid(blogId)
            ? { _id: blogId }
            : { slug: blogId };

        const blog = await Blog.findOne(query)
            .populate("author", "fullName profileImage _id")
            .populate("likes", "fullName profileImage _id")
            .setOptions({ skipValidation: true }); // Add this line

        if (!blog) {
            logger.error("Blog not found");
            throw new ApiError(404, "Blog not found");
        }

        // 2. Check if blog is published (unless author is requesting)
        const isAuthor = blog?.author && req?.client && blog.author._id?.toString() === req.client._id?.toString();
        if (blog.status !== "published" && !isAuthor) {
            logger.error("Blog is not published");
            throw new ApiError(404, "Blog not found");
        }

        // 3. Increment views if not the author
        if (!isAuthor) {
            await blog.incrementViews();
        }

        res.status(200).json(
            new ApiResponse(200, blog, "Blog fetched successfully")
        );
    } catch (error) {
        logger.error(`Error in getBlogById: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, error.message || "Failed to fetch blog");
    }
});

// Toggle blog like
const toggleLike = asyncHandler(async (req, res) => {
    const { blogId } = req.params;

    // Validate blog ID
    if (!mongoose.Types.ObjectId.isValid(blogId)) {
        throw new ApiError(400, "Invalid blog ID");
    }

    try {
        const blog = await Blog.findById(blogId);
        if (!blog) throw new ApiError(404, "Blog not found");
        if (blog.status !== "published") throw new ApiError(400, "Cannot like unpublished blog");

        const isLiked = blog.likes.includes(req.client._id);
        const updateOperation = isLiked
            ? { $pull: { likes: req.client._id } }
            : { $addToSet: { likes: req.client._id } };

        const updatedBlog = await Blog.findByIdAndUpdate(
            blogId,
            updateOperation,
            { new: true }
        ).select('likes');

        res.status(200).json(
            new ApiResponse(200, { likes: updatedBlog.likes }, "Like toggled successfully")
        );
    } catch (error) {
        logger.error(`Error in toggleLike: ${error.message}`, { stack: error.stack });
        throw error instanceof ApiError ? error : new ApiError(500, "Failed to toggle like");
    }
});
// Upload/update cover image with enhanced ownership verification
const uploadCoverImage = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        logger.info(`Starting cover image upload process for client ${req.client._id}`);

        const { blogId } = req.params;

        // 1. Verify client exists and is active
        const client = await Client.findById(req.client._id)
            .select("status")
            .session(session);

        if (!client) {
            logger.error("Client not found");
            throw new ApiError(404, "Client not found");
        }

        if (client.status !== "active") {
            logger.error("Client account is not active");
            throw new ApiError(403, "Your account is not active");
        }

        // 2. Validate blog ID
        if (!mongoose.Types.ObjectId.isValid(blogId)) {
            logger.error("Invalid blog ID");
            throw new ApiError(400, "Invalid blog ID");
        }

        // 3. Verify blog ownership
        const blog = await Blog.findById(blogId).session(session);
        if (!blog) {
            logger.error("Blog not found");
            throw new ApiError(404, "Blog not found");
        }

        if (blog.author.toString() !== req.client._id.toString()) {
            logger.error("Unauthorized: Client doesn't own this blog");
            throw new ApiError(403, "Unauthorized: You can only update your own blogs");
        }

        // 4. Check if file exists
        if (!req.file?.path) {
            logger.error("No cover image file uploaded");
            throw new ApiError(400, "Cover image file is required");
        }

        // 5. Upload to Cloudinary
        const cloudinaryResponse = await uploadOnCloudinary(req.file.path);
        if (!cloudinaryResponse?.secure_url) {
            logger.error("Failed to upload cover image to Cloudinary");
            throw new ApiError(500, "Failed to upload cover image");
        }

        // 6. If there was an existing cover image, delete it from Cloudinary
        if (blog.coverImage.url) {
            try {
                const publicId = blog.coverImage.url.split("/").pop().split(".")[0];
                logger.info(`Attempting to delete previous cover image from Cloudinary: ${publicId}`);
                await deleteFromCloudinary(publicId);
                logger.info('Previous cover image deleted successfully');
            } catch (cloudinaryError) {
                logger.error('Failed to delete previous cover image', { error: cloudinaryError });
                // Continue with new image upload even if deletion fails
            }
        }

        // 7. Update blog with new cover image URL
        blog.coverImage = {
            url: cloudinaryResponse.secure_url,
            altText: req.body.altText || `Cover image for ${blog.title}`
        };
        await blog.save({ session });

        await session.commitTransaction();
        logger.info(`Cover image uploaded successfully for blog ${blogId} by client ${req.client._id}`);

        res.status(200).json(
            new ApiResponse(200, { coverImage: blog.coverImage }, "Cover image uploaded successfully")
        );
    } catch (error) {
        await session.abortTransaction();
        logger.error(`Error in uploadCoverImage: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, error.message || "Failed to upload cover image");
    } finally {
        session.endSession();
    }
});

// Get blogs by author
const getBlogsByAuthor = asyncHandler(async (req, res) => {
    try {
        logger.info("Fetching blogs by author");

        const { authorId } = req.params;

        // 1. Parse query parameters
        const {
            status = "published",
            page = 1,
            limit = 10
        } = req.query;

        // 2. Build query object
        const query = { author: authorId };

        // 3. Compare authorId and client._id safely
        const isAuthor = req?.client?._id?.toString?.() === authorId;

        if (!isAuthor) {
            query.status = "published";
        } else if (status) {
            query.status = status;
        }

        // 4. Calculate pagination
        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;

        // 5. Execute query
        const blogs = await Blog.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .select("-content"); // Omit full content in list view

        const totalBlogs = await Blog.countDocuments(query);

        res.status(200).json(
            new ApiResponse(200, {
                blogs,
                total: totalBlogs,
                page: pageNum,
                pages: Math.ceil(totalBlogs / limitNum)
            }, "Blogs fetched successfully")
        );
    } catch (error) {
        logger.error(`Error in getBlogsByAuthor: ${error.message}`, { stack: error.stack });
        throw new ApiError(500, error.message || "Failed to fetch blogs by author");
    }
});


export {
    createBlog,
    getAllBlogs,
    getBlogById,
    updateBlog,
    deleteBlog,
    toggleLike,
    uploadCoverImage,
    getBlogsByAuthor
};