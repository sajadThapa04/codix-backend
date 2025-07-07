import asyncHandler from "../utils/asyncHandler.utils.js";
import { ApiError } from "../utils/ApiError.utils.js";
import ApiResponse from "../utils/ApiResponse.utils.js";
import mongoose from "mongoose";
import logger from "../utils/logger.utils.js";
import Services from "../models/services.models.js";
import Admin from "../models/admin.model.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.utils.js";

// Improved helper function to check admin permissions
const checkAdminPermissions = async (adminId, permission) => {
    const admin = await Admin.findById(adminId).select("role permissions");
    if (!admin) {
        throw new ApiError(404, "Admin not found");
    }
    if (admin.role === "superadmin") return true;
    return admin.permissions[permission];
};

// Create a new service
const createService = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        logger.info("Starting createService process");

        // 1. Authorization Check
        const hasPermission = await checkAdminPermissions(req.admin._id, "manageServices");
        if (!hasPermission) {
            logger.error("Unauthorized: Admin doesn't have permission to manage services");
            throw new ApiError(403, "Unauthorized: You don't have permission to manage services");
        }

        const {
            title,
            category,
            description,
            features,
            price,
            isCustomizable,
            deliveryTimeInDays,
            tags,

        } = req.body;

        // 2. Required fields validation
        if (!title || !description || price === undefined) {
            logger.error("Missing required fields");
            throw new ApiError(400, "Title, description and price are required");
        }

        // 3. Price validation
        if (isNaN(price)) {
            logger.error("Invalid price format");
            throw new ApiError(400, "Price must be a number");
        }

        // 4. Create service
        const service = await Services.create([{
            title,
            category,
            description,
            features: features || [],
            price,
            isCustomizable: isCustomizable !== undefined ? isCustomizable : true,
            deliveryTimeInDays: deliveryTimeInDays || 7,
            tags: tags || [],
            createdBy: req.admin._id
        }], { session });

        await session.commitTransaction();
        logger.info(`Service created successfully: ${service[0].title}`);

        res.status(201).json(
            new ApiResponse(201, service[0], "Service created successfully")
        );
    } catch (error) {
        await session.abortTransaction();
        logger.error(`Error in createService: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) {
            throw error;
        }
        if (error.name === "ValidationError") {
            throw new ApiError(400, error.message);
        }
        if (error.code === 11000) {
            throw new ApiError(409, "Service with this title already exists");
        }
        throw new ApiError(500, error.message || "Failed to create service");
    } finally {
        session.endSession();
    }
});

// Get all services
const getAllServices = asyncHandler(async (req, res) => {
    try {
        logger.info("Fetching all services");

        // 1. Parse query parameters
        const {
            category,
            status = "active",
            minPrice,
            maxPrice,
            search,
            sortBy = "createdAt",
            sortOrder = "desc",
            page = 1,
            limit = 10
        } = req.query;

        // 2. Build query object
        const query = { status };

        if (category) {
            query.category = category;
        }

        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = Number(minPrice);
            if (maxPrice) query.price.$lte = Number(maxPrice);
        }

        if (search) {
            query.$or = [
                { title: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
                { tags: { $regex: search, $options: "i" } }
            ];
        }

        // 3. Build sort object
        const sort = {};
        sort[sortBy] = sortOrder === "desc" ? -1 : 1;

        // 4. Calculate pagination
        const skip = (page - 1) * limit;

        // 5. Execute query
        const services = await Services.find(query)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .populate("createdBy", "fullName email");

        const totalServices = await Services.countDocuments(query);

        res.status(200).json(
            new ApiResponse(200, {
                services,
                total: totalServices,
                page: Number(page),
                pages: Math.ceil(totalServices / limit)
            }, "Services fetched successfully")
        );
    } catch (error) {
        logger.error(`Error in getAllServices: ${error.message}`, { stack: error.stack });
        throw new ApiError(500, error.message || "Failed to fetch services");
    }
});

// Get service by ID
const getServiceById = asyncHandler(async (req, res) => {
    try {
        logger.info("Fetching service by ID");

        const { serviceId } = req.params;

        // 1. Validate service ID
        if (!mongoose.Types.ObjectId.isValid(serviceId)) {
            logger.error("Invalid service ID");
            throw new ApiError(400, "Invalid service ID");
        }

        // 2. Find service
        const service = await Services.findById(serviceId)
            .populate("createdBy", "fullName email");

        if (!service) {
            logger.error("Service not found");
            throw new ApiError(404, "Service not found");
        }

        // 3. Check if service is active (unless admin is requesting)
        if (service.status !== "active" && !req.admin) {
            logger.error("Service is inactive");
            throw new ApiError(404, "Service not found");
        }

        res.status(200).json(
            new ApiResponse(200, service, "Service fetched successfully")
        );
    } catch (error) {
        logger.error(`Error in getServiceById: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, error.message || "Failed to fetch service");
    }
});

// Update service
const updateService = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        logger.info("Starting updateService process");

        const { serviceId } = req.params;

        // 1. Authorization Check
        const hasPermission = await checkAdminPermissions(req.admin._id, "manageServices");
        if (!hasPermission) {
            logger.error("Unauthorized: Admin doesn't have permission to manage services");
            throw new ApiError(403, "Unauthorized: You don't have permission to manage services");
        }

        // 2. Validate service ID
        if (!mongoose.Types.ObjectId.isValid(serviceId)) {
            logger.error("Invalid service ID");
            throw new ApiError(400, "Invalid service ID");
        }

        // 3. Find service
        const service = await Services.findById(serviceId).session(session);
        if (!service) {
            logger.error("Service not found");
            throw new ApiError(404, "Service not found");
        }

        // 4. Check if admin created this service or is superadmin
        const isSuperadmin = req.admin.role === "superadmin";
        const isCreator = service.createdBy.toString() === req.admin._id.toString();

        if (!isCreator && !isSuperadmin) {
            logger.error("Unauthorized: You can only update services you created");
            throw new ApiError(403, "Unauthorized: You can only update services you created");
        }

        // 5. Update fields
        const updatableFields = [
            "title", "category", "description", "features",
            "price", "isCustomizable", "deliveryTimeInDays",
            "tags", "", "status"
        ];

        updatableFields.forEach(field => {
            if (req.body[field] !== undefined) {
                service[field] = req.body[field];
            }
        });

        // 6. Save updated service
        await service.save({ session });
        await session.commitTransaction();

        logger.info(`Service updated successfully: ${service.title}`);

        res.status(200).json(
            new ApiResponse(200, service, "Service updated successfully")
        );
    } catch (error) {
        await session.abortTransaction();
        logger.error(`Error in updateService: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) {
            throw error;
        }
        if (error.name === "ValidationError") {
            throw new ApiError(400, error.message);
        }
        if (error.code === 11000) {
            throw new ApiError(409, "Service with this title already exists");
        }
        throw new ApiError(500, error.message || "Failed to update service");
    } finally {
        session.endSession();
    }
});

// Delete service
const deleteService = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        logger.info("Starting deleteService process");

        const { serviceId } = req.params;

        // 1. Authorization Check
        const hasPermission = await checkAdminPermissions(req.admin._id, "manageServices");
        if (!hasPermission) {
            logger.error("Unauthorized: Admin doesn't have permission to manage services");
            throw new ApiError(403, "Unauthorized: You don't have permission to manage services");
        }

        // 2. Validate service ID
        if (!mongoose.Types.ObjectId.isValid(serviceId)) {
            logger.error("Invalid service ID");
            throw new ApiError(400, "Invalid service ID");
        }

        // 3. Find service (don't delete yet so we can check thumbnail)
        const service = await Services.findById(serviceId).session(session);
        if (!service) {
            logger.error("Service not found");
            throw new ApiError(404, "Service not found");
        }

        // 4. Check if admin created this service or is superadmin
        const isSuperadmin = req.admin.role === "superadmin";
        const isCreator = service.createdBy.toString() === req.admin._id.toString();

        if (!isCreator && !isSuperadmin) {
            logger.error("Unauthorized: You can only delete services you created");
            throw new ApiError(403, "Unauthorized: You can only delete services you created");
        }

        // 5. Delete thumbnail from Cloudinary if it exists
        if (service.thumbnail) {
            try {
                const publicId = service.thumbnail.split('/').pop().split('.')[0];
                logger.info(`Attempting to delete thumbnail from Cloudinary with publicId: ${publicId}`);
                await deleteFromCloudinary(publicId);
                logger.info('Thumbnail deleted from Cloudinary successfully');
            } catch (cloudinaryError) {
                logger.error('Failed to delete thumbnail from Cloudinary', { error: cloudinaryError });
                // Don't fail the entire operation if thumbnail deletion fails
                // Continue with service deletion but log the error
            }
        }

        // 6. Delete the service
        await Services.findByIdAndDelete(serviceId).session(session);

        await session.commitTransaction();
        logger.info(`Service deleted successfully: ${service.title}`);

        res.status(200).json(
            new ApiResponse(200, {}, "Service deleted successfully")
        );
    } catch (error) {
        await session.abortTransaction();
        logger.error(`Error in deleteService: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, error.message || "Failed to delete service");
    } finally {
        session.endSession();
    }
});

// Toggle service status
const toggleServiceStatus = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        logger.info("Starting toggleServiceStatus process");

        const { serviceId } = req.params;

        // 1. Authorization Check
        const hasPermission = await checkAdminPermissions(req.admin._id, "manageServices");
        if (!hasPermission) {
            logger.error("Unauthorized: Admin doesn't have permission to manage services");
            throw new ApiError(403, "Unauthorized: You don't have permission to manage services");
        }

        // 2. Validate service ID
        if (!mongoose.Types.ObjectId.isValid(serviceId)) {
            logger.error("Invalid service ID");
            throw new ApiError(400, "Invalid service ID");
        }

        // 3. Find service
        const service = await Services.findById(serviceId).session(session);
        if (!service) {
            logger.error("Service not found");
            throw new ApiError(404, "Service not found");
        }

        // 4. Check if admin created this service or is superadmin
        const isSuperadmin = req.admin.role === "superadmin";
        const isCreator = service.createdBy.toString() === req.admin._id.toString();

        if (!isCreator && !isSuperadmin) {
            logger.error("Unauthorized: You can only update services you created");
            throw new ApiError(403, "Unauthorized: You can only update services you created");
        }

        // 5. Toggle status
        service.status = service.status === "active" ? "inactive" : "active";
        await service.save({ session });
        await session.commitTransaction();

        logger.info(`Service status toggled to ${service.status}: ${service.title}`);

        res.status(200).json(
            new ApiResponse(200, service, "Service status updated successfully")
        );
    } catch (error) {
        await session.abortTransaction();
        logger.error(`Error in toggleServiceStatus: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, error.message || "Failed to toggle service status");
    } finally {
        session.endSession();
    }
});

const uploadThumbnail = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        logger.info("Starting thumbnail upload process");

        const { serviceId } = req.params;

        // 1. Authorization Check
        const hasPermission = await checkAdminPermissions(req.admin._id, "manageServices");
        if (!hasPermission) {
            logger.error("Unauthorized: Admin doesn't have permission to manage services");
            throw new ApiError(403, "Unauthorized: You don't have permission to manage services");
        }

        // 2. Validate service ID
        if (!mongoose.Types.ObjectId.isValid(serviceId)) {
            logger.error("Invalid service ID");
            throw new ApiError(400, "Invalid service ID");
        }

        // 3. Check if file exists
        if (!req.file?.path) {
            logger.error("No thumbnail file uploaded");
            throw new ApiError(400, "Thumbnail file is required");
        }

        // 4. Find the service
        const service = await Services.findById(serviceId).session(session);
        if (!service) {
            logger.error("Service not found");
            throw new ApiError(404, "Service not found");
        }

        // 5. Check if admin created this service or is superadmin
        const isSuperadmin = req.admin.role === "superadmin";
        const isCreator = service.createdBy.toString() === req.admin._id.toString();

        if (!isCreator && !isSuperadmin) {
            logger.error("Unauthorized: You can only update services you created");
            throw new ApiError(403, "Unauthorized: You can only update services you created");
        }

        // 6. Upload to Cloudinary
        const cloudinaryResponse = await uploadOnCloudinary(req.file.path);
        if (!cloudinaryResponse?.secure_url) {
            logger.error("Failed to upload thumbnail to Cloudinary");
            throw new ApiError(500, "Failed to upload thumbnail");
        }

        // 7. If there was an existing thumbnail, delete it from Cloudinary
        if (service.thumbnail) {
            const publicId = service.thumbnail.split("/").pop().split(".")[0];
            await deleteFromCloudinary(publicId);
        }

        // 8. Update service with new thumbnail URL
        service.thumbnail = cloudinaryResponse.secure_url;
        await service.save({ session });

        await session.commitTransaction();
        logger.info(`Thumbnail uploaded successfully for service: ${service.title}`);

        res.status(200).json(
            new ApiResponse(200, { thumbnail: service.thumbnail }, "Thumbnail uploaded successfully")
        );
    } catch (error) {
        await session.abortTransaction();
        logger.error(`Error in uploadThumbnail: ${error.message}`, { stack: error.stack });
        throw new ApiError(500, error.message || "Failed to upload thumbnail");
    }
});

const updateThumbnail = asyncHandler(async (req, res) => {
    // This is essentially the same as uploadThumbnail since both operations
    // will replace the existing thumbnail with a new one
    // We can just call uploadThumbnail internally
    return uploadThumbnail(req, res);
});
export {
    createService,
    getAllServices,
    getServiceById,
    updateService,
    deleteService,
    toggleServiceStatus,
    uploadThumbnail,
    updateThumbnail
};