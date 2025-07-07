import asyncHandler from "../utils/asyncHandler.utils.js";
import { ApiError } from "../utils/ApiError.utils.js";
import ApiResponse from "../utils/ApiResponse.utils.js";
import mongoose from "mongoose";
import logger from "../utils/logger.utils.js";
import Pricing from "../models/Pricing.model.js";
import Services from "../models/services.models.js";
import Admin from "../models/admin.model.js";

// Reuse your existing permission check helper
const checkAdminPermissions = async (adminId, permission) => {
    const admin = await Admin.findById(adminId).select("role permissions");
    if (!admin) {
        throw new ApiError(404, "Admin not found");
    }
    if (admin.role === "superadmin") return true;
    return admin.permissions[permission];
};

// Create pricing for a service
const createPricing = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        logger.info("Starting createPricing process");

        // 1. Authorization Check
        const hasPermission = await checkAdminPermissions(req.admin._id, "managePricing");
        if (!hasPermission) {
            logger.error("Unauthorized: Admin doesn't have permission to manage pricing");
            throw new ApiError(403, "Unauthorized: You don't have permission to manage pricing");
        }

        const { serviceId, tiers, currency } = req.body;

        // 2. Required fields validation
        if (!serviceId || !tiers || !Array.isArray(tiers) || tiers.length === 0) {
            logger.error("Missing required fields");
            throw new ApiError(400, "Service ID and at least one pricing tier are required");
        }

        // 3. Validate service exists
        const serviceExists = await Services.exists({ _id: serviceId }).session(session);
        if (!serviceExists) {
            logger.error("Service not found");
            throw new ApiError(404, "Service not found");
        }

        // 4. Validate tiers
        for (const tier of tiers) {
            if (!tier.name || tier.price === undefined) {
                throw new ApiError(400, "Each tier must have a name and price");
            }
            if (isNaN(tier.price)) {
                throw new ApiError(400, "Price must be a number");
            }
        }

        // 5. Check if pricing already exists for this service
        const existingPricing = await Pricing.findOne({ serviceId }).session(session);
        if (existingPricing) {
            logger.error("Pricing already exists for this service");
            throw new ApiError(409, "Pricing already exists for this service");
        }

        // 6. Create pricing
        const pricing = await Pricing.create([{
            serviceId,
            tiers,
            currency: currency || "USD"
        }], { session });

        await session.commitTransaction();
        logger.info(`Pricing created successfully for service: ${serviceId}`);

        res.status(201).json(
            new ApiResponse(201, pricing[0], "Pricing created successfully")
        );
    } catch (error) {
        await session.abortTransaction();
        logger.error(`Error in createPricing: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) {
            throw error;
        }
        if (error.name === "ValidationError") {
            throw new ApiError(400, error.message);
        }
        throw new ApiError(500, error.message || "Failed to create pricing");
    } finally {
        session.endSession();
    }
});

// Get pricing by service ID
const getPricingByServiceId = asyncHandler(async (req, res) => {
    try {
        logger.info("Fetching pricing by service ID");

        const { serviceId } = req.params;

        // 1. Validate service ID
        if (!mongoose.Types.ObjectId.isValid(serviceId)) {
            logger.error("Invalid service ID");
            throw new ApiError(400, "Invalid service ID");
        }

        // 2. Find pricing
        const pricing = await Pricing.findOne({ serviceId })
            .populate("serviceId", "title category status");

        if (!pricing) {
            logger.error("Pricing not found");
            throw new ApiError(404, "Pricing not found");
        }

        // 3. Check if service is active (unless admin is requesting)
        if (pricing.serviceId.status !== "active" && !req.admin) {
            logger.error("Service is inactive");
            throw new ApiError(404, "Pricing not available");
        }

        res.status(200).json(
            new ApiResponse(200, pricing, "Pricing fetched successfully")
        );
    } catch (error) {
        logger.error(`Error in getPricingByServiceId: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, error.message || "Failed to fetch pricing");
    }
});

// Update pricing
const updatePricing = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        logger.info("Starting updatePricing process");

        const { pricingId } = req.params;

        // 1. Authorization Check
        const hasPermission = await checkAdminPermissions(req.admin._id, "managePricing");
        if (!hasPermission) {
            logger.error("Unauthorized: Admin doesn't have permission to manage pricing");
            throw new ApiError(403, "Unauthorized: You don't have permission to manage pricing");
        }

        // 2. Validate pricing ID
        if (!mongoose.Types.ObjectId.isValid(pricingId)) {
            logger.error("Invalid pricing ID");
            throw new ApiError(400, "Invalid pricing ID");
        }

        // 3. Find pricing
        const pricing = await Pricing.findById(pricingId).session(session);
        if (!pricing) {
            logger.error("Pricing not found");
            throw new ApiError(404, "Pricing not found");
        }

        // 4. Validate tiers if provided
        if (req.body.tiers) {
            if (!Array.isArray(req.body.tiers)) {
                throw new ApiError(400, "Tiers must be an array");
            }
            for (const tier of req.body.tiers) {
                if (!tier.name || tier.price === undefined) {
                    throw new ApiError(400, "Each tier must have a name and price");
                }
                if (isNaN(tier.price)) {
                    throw new ApiError(400, "Price must be a number");
                }
            }
        }

        // 5. Update fields
        const updatableFields = ["tiers", "currency", "status"];
        updatableFields.forEach(field => {
            if (req.body[field] !== undefined) {
                pricing[field] = req.body[field];
            }
        });

        // 6. Save updated pricing
        await pricing.save({ session });
        await session.commitTransaction();

        logger.info(`Pricing updated successfully: ${pricingId}`);

        res.status(200).json(
            new ApiResponse(200, pricing, "Pricing updated successfully")
        );
    } catch (error) {
        await session.abortTransaction();
        logger.error(`Error in updatePricing: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) {
            throw error;
        }
        if (error.name === "ValidationError") {
            throw new ApiError(400, error.message);
        }
        throw new ApiError(500, error.message || "Failed to update pricing");
    } finally {
        session.endSession();
    }
});

// Delete pricing
const deletePricing = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        logger.info("Starting deletePricing process");

        const { pricingId } = req.params;

        // 1. Authorization Check
        const hasPermission = await checkAdminPermissions(req.admin._id, "managePricing");
        if (!hasPermission) {
            logger.error("Unauthorized: Admin doesn't have permission to manage pricing");
            throw new ApiError(403, "Unauthorized: You don't have permission to manage pricing");
        }

        // 2. Validate pricing ID
        if (!mongoose.Types.ObjectId.isValid(pricingId)) {
            logger.error("Invalid pricing ID");
            throw new ApiError(400, "Invalid pricing ID");
        }

        // 3. Find and delete pricing
        const pricing = await Pricing.findByIdAndDelete(pricingId).session(session);
        if (!pricing) {
            logger.error("Pricing not found");
            throw new ApiError(404, "Pricing not found");
        }

        await session.commitTransaction();
        logger.info(`Pricing deleted successfully: ${pricingId}`);

        res.status(200).json(
            new ApiResponse(200, {}, "Pricing deleted successfully")
        );
    } catch (error) {
        await session.abortTransaction();
        logger.error(`Error in deletePricing: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, error.message || "Failed to delete pricing");
    } finally {
        session.endSession();
    }
});

// Toggle pricing status
const togglePricingStatus = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        logger.info("Starting togglePricingStatus process");

        const { pricingId } = req.params;

        // 1. Authorization Check
        const hasPermission = await checkAdminPermissions(req.admin._id, "managePricing");
        if (!hasPermission) {
            logger.error("Unauthorized: Admin doesn't have permission to manage pricing");
            throw new ApiError(403, "Unauthorized: You don't have permission to manage pricing");
        }

        // 2. Validate pricing ID
        if (!mongoose.Types.ObjectId.isValid(pricingId)) {
            logger.error("Invalid pricing ID");
            throw new ApiError(400, "Invalid pricing ID");
        }

        // 3. Find pricing
        const pricing = await Pricing.findById(pricingId).session(session);
        if (!pricing) {
            logger.error("Pricing not found");
            throw new ApiError(404, "Pricing not found");
        }

        // 4. Toggle status
        pricing.status = pricing.status === "active" ? "inactive" : "active";
        await pricing.save({ session });
        await session.commitTransaction();

        logger.info(`Pricing status toggled to ${pricing.status}: ${pricingId}`);

        res.status(200).json(
            new ApiResponse(200, pricing, "Pricing status updated successfully")
        );
    } catch (error) {
        await session.abortTransaction();
        logger.error(`Error in togglePricingStatus: ${error.message}`, { stack: error.stack });

        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, error.message || "Failed to toggle pricing status");
    } finally {
        session.endSession();
    }
});

export {
    createPricing,
    getPricingByServiceId,
    updatePricing,
    deletePricing,
    togglePricingStatus
};