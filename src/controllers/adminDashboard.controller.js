import asyncHandler from "../utils/asyncHandler.utils.js";
import { ApiError } from "../utils/ApiError.utils.js";
import ApiResponse from "../utils/ApiResponse.utils.js";
import mongoose from "mongoose";
import logger from "../utils/logger.utils.js";
import Client from "../models/client.model.js";
import { isEmailValid, isPhoneValid } from "../utils/validator.utils.js";
import Blog from "../models/blog.model.js";

// Utility to validate MongoDB ID
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);


const getAllClients = asyncHandler(async (req, res) => {
    try {
        // Pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Filtering
        const filter = {};
        if (req.query.status) {
            filter.status = req.query.status;
        }
        if (req.query.role) {
            filter.role = req.query.role;
        }
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            filter.$or = [
                { fullName: searchRegex },
                { email: searchRegex },
                { phone: searchRegex }
            ];
        }

        // Sorting
        const sort = {};
        if (req.query.sortBy) {
            const parts = req.query.sortBy.split(':');
            sort[parts[0]] = parts[1] === 'desc' ? -1 : 1;
        } else {
            sort.createdAt = -1; // Default: newest first
        }

        // Query
        const clients = await Client.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .select('-password -refreshToken -verificationToken -resetPasswordToken');

        // Count total for pagination
        const total = await Client.countDocuments(filter);

        res.status(200).json(
            new ApiResponse(200, {
                clients,
                pagination: {
                    total,
                    page,
                    pages: Math.ceil(total / limit),
                    limit
                }
            }, "Clients retrieved successfully")
        );

    } catch (error) {
        logger.error(`Admin getAllClients error: ${error.message}`, { stack: error.stack });
        throw new ApiError(500, "Failed to retrieve clients");
    }
});


const getClientById = asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            throw new ApiError(400, "Invalid client ID format");
        }

        const client = await Client.findById(id)
            .select('-password -refreshToken -verificationToken -resetPasswordToken');

        if (!client) {
            throw new ApiError(404, "Client not found");
        }

        res.status(200).json(
            new ApiResponse(200, client, "Client retrieved successfully")
        );

    } catch (error) {
        logger.error(`Admin getClientById error: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) throw error;
        if (error.name === 'CastError') throw new ApiError(400, "Invalid client ID");

        throw new ApiError(500, "Failed to retrieve client");
    }
});

const updateClient = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;
        const { fullName, email, phone, status, role, address, isEmailVerified, isPhoneVerified } = req.body;

        if (!isValidObjectId(id)) {
            throw new ApiError(400, "Invalid client ID format");
        }

        // Validate inputs
        if (email && !isEmailValid(email)) {
            throw new ApiError(400, "Invalid email format");
        }

        if (phone && !isPhoneValid(phone)) {
            throw new ApiError(400, "Invalid phone number");
        }

        if (role && !['client', 'admin'].includes(role)) {
            throw new ApiError(400, "Invalid role specified");
        }

        if (status && !['active', 'inactive', 'banned', 'pending'].includes(status)) {
            throw new ApiError(400, "Invalid status specified");
        }

        // Find client
        const client = await Client.findById(id).session(session);
        if (!client) {
            throw new ApiError(404, "Client not found");
        }

        // Check for unique fields
        if (email && email !== client.email) {
            const existingClient = await Client.findOne({ email }).session(session);
            if (existingClient) {
                throw new ApiError(409, "Email already in use");
            }
        }

        if (phone && phone !== client.phone) {
            const existingPhone = await Client.findOne({ phone }).session(session);
            if (existingPhone) {
                throw new ApiError(409, "Phone number already in use");
            }
        }

        // Prepare updates
        const updates = {};
        if (fullName) updates.fullName = fullName;
        if (email) updates.email = email;
        if (phone) updates.phone = phone;
        if (status) updates.status = status;
        if (role) updates.role = role;
        if (typeof isEmailVerified === 'boolean') updates.isEmailVerified = isEmailVerified;
        if (typeof isPhoneVerified === 'boolean') updates.isPhoneVerified = isPhoneVerified;
        if (address) {
            updates.address = {
                country: address.country || client.address?.country,
                city: address.city || client.address?.city,
                street: address.street || client.address?.street
            };
        }

        // Update client
        const updatedClient = await Client.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true, session }
        ).select('-password -refreshToken -verificationToken -resetPasswordToken');

        await session.commitTransaction();

        res.status(200).json(
            new ApiResponse(200, updatedClient, "Client updated successfully")
        );

    } catch (error) {
        await session.abortTransaction();
        logger.error(`Admin updateClient error: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) throw error;
        if (error.code === 11000) throw new ApiError(400, "Duplicate field value");

        throw new ApiError(500, "Failed to update client");
    } finally {
        session.endSession();
    }
});


const deleteClient = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            throw new ApiError(400, "Invalid client ID format");
        }

        const client = await Client.findByIdAndDelete(id)
            .session(session)
            .select('-password -refreshToken -verificationToken -resetPasswordToken');

        if (!client) {
            throw new ApiError(404, "Client not found");
        }

        // TODO: Add any cleanup operations here (e.g., delete related records, files, etc.)

        await session.commitTransaction();

        res.status(200).json(
            new ApiResponse(200, client, "Client deleted successfully")
        );

    } catch (error) {
        await session.abortTransaction();
        logger.error(`Admin deleteClient error: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) throw error;

        throw new ApiError(500, "Failed to delete client");
    } finally {
        session.endSession();
    }
});

const getAllBlogs = asyncHandler(async (req, res) => {
    try {
        // Pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Filtering
        const filter = {};
        if (req.query.status) {
            filter.status = req.query.status;
        }
        if (req.query.category) {
            filter.category = req.query.category;
        }
        if (req.query.featured) {
            filter.featured = req.query.featured === 'true';
        }
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            filter.$or = [
                { title: searchRegex },
                { content: searchRegex },
                { tags: searchRegex }
            ];
        }

        // Sorting
        const sort = {};
        if (req.query.sortBy) {
            const parts = req.query.sortBy.split(':');
            sort[parts[0]] = parts[1] === 'desc' ? -1 : 1;
        } else {
            sort.createdAt = -1; // Default: newest first
        }

        // Query with author population
        const blogs = await Blog.find(filter)
            .populate('author', 'fullName email role status')
            .sort(sort)
            .skip(skip)
            .limit(limit);

        // Count total for pagination
        const total = await Blog.countDocuments(filter);

        res.status(200).json(
            new ApiResponse(200, {
                blogs,
                pagination: {
                    total,
                    page,
                    pages: Math.ceil(total / limit),
                    limit
                }
            }, "Blogs retrieved successfully")
        );

    } catch (error) {
        logger.error(`Admin getAllBlogs error: ${error.message}`, { stack: error.stack });
        throw new ApiError(500, "Failed to retrieve blogs");
    }
});


const getBlogById = asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            throw new ApiError(400, "Invalid blog ID format");
        }

        const blog = await Blog.findById(id)
            .populate('author', 'fullName email role status')
            .populate('likes', 'fullName email');

        if (!blog) {
            throw new ApiError(404, "Blog not found");
        }

        res.status(200).json(
            new ApiResponse(200, blog, "Blog retrieved successfully")
        );

    } catch (error) {
        logger.error(`Admin getBlogById error: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) throw error;
        if (error.name === 'CastError') throw new ApiError(400, "Invalid blog ID");

        throw new ApiError(500, "Failed to retrieve blog");
    }
});

const deleteBlog = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            throw new ApiError(400, "Invalid blog ID format");
        }

        const blog = await Blog.findByIdAndDelete(id)
            .session(session)
            .populate('author', 'fullName email');

        if (!blog) {
            throw new ApiError(404, "Blog not found");
        }

        // TODO: Add any cleanup operations here (e.g., delete comments, remove images, etc.)

        await session.commitTransaction();

        res.status(200).json(
            new ApiResponse(200, blog, "Blog deleted successfully")
        );

    } catch (error) {
        await session.abortTransaction();
        logger.error(`Admin deleteBlog error: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) throw error;

        throw new ApiError(500, "Failed to delete blog");
    } finally {
        session.endSession();
    }
});

const changeBlogStatus = asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!isValidObjectId(id)) {
            throw new ApiError(400, "Invalid blog ID format");
        }

        if (!['draft', 'published', 'archived'].includes(status)) {
            throw new ApiError(400, "Invalid status specified");
        }

        const blog = await Blog.findByIdAndUpdate(
            id,
            { status },
            { new: true }
        ).populate('author', 'fullName email');

        if (!blog) {
            throw new ApiError(404, "Blog not found");
        }

        res.status(200).json(
            new ApiResponse(200, blog, `Blog status changed to ${status} successfully`)
        );

    } catch (error) {
        logger.error(`Admin changeBlogStatus error: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) throw error;
        if (error.name === 'CastError') throw new ApiError(400, "Invalid blog ID");

        throw new ApiError(500, "Failed to change blog status");
    }
});

const toggleBlogFeatured = asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            throw new ApiError(400, "Invalid blog ID format");
        }

        const blog = await Blog.findById(id);
        if (!blog) {
            throw new ApiError(404, "Blog not found");
        }

        blog.featured = !blog.featured;
        await blog.save();

        res.status(200).json(
            new ApiResponse(200, blog, `Blog featured status toggled to ${blog.featured} successfully`)
        );

    } catch (error) {
        logger.error(`Admin toggleBlogFeatured error: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) throw error;
        if (error.name === 'CastError') throw new ApiError(400, "Invalid blog ID");

        throw new ApiError(500, "Failed to toggle blog featured status");
    }
});
export {
    getAllClients,
    getClientById,
    updateClient,
    deleteClient,
    getAllBlogs,
    getBlogById,
    deleteBlog,
    changeBlogStatus,
    toggleBlogFeatured
};