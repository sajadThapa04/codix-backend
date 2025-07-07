import asyncHandler from "../utils/asyncHandler.utils.js";
import { ApiError } from "../utils/ApiError.utils.js";
import ApiResponse from "../utils/ApiResponse.utils.js";
import mongoose from "mongoose";
import logger from "../utils/logger.utils.js";
import ClientServiceRequest from "../models/clientServiceRequest.model.js";
import Client from "../models/client.model.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.utils.js";
import { areRequiredFieldsProvided } from "../utils/validator.utils.js";
import Admin from "../models/admin.model.js";
// Upload attachments for service request and update database
const uploadServiceRequestAttachments = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { requestId } = req.params;
        logger.info(`Attachment upload initiated for request ${requestId} by client ${req.client?._id}`);

        if (!mongoose.Types.ObjectId.isValid(requestId)) {
            logger.warn("Invalid request ID format", { requestId });
            throw new ApiError(400, "Invalid request ID format");
        }

        if (!req.files) {
            logger.warn("No files found in request - possible middleware issue");
            throw new ApiError(400, "No files were uploaded");
        }

        const files = Array.isArray(req.files) ? req.files : [req.files];

        if (files.length === 0) {
            logger.warn("Empty files array received");
            throw new ApiError(400, "At least one attachment file is required");
        }

        // Verify the request exists and belongs to the client
        const serviceRequest = await ClientServiceRequest.findOne({
            _id: requestId,
            createdBy: req.client._id
        }).session(session);

        if (!serviceRequest) {
            logger.warn("Service request not found or unauthorized", { requestId });
            throw new ApiError(404, "Service request not found");
        }

        logger.info(`Processing ${files.length} attachments for request ${requestId}`);

        // Upload files to Cloudinary
        const uploadPromises = files.map(file => {
            if (!file.path) {
                logger.error("File missing path property", { file });
                throw new ApiError(500, "File processing error");
            }
            return uploadOnCloudinary(file.path);
        });

        const uploadResults = await Promise.all(uploadPromises);
        const successfulUploads = uploadResults.filter(result => result?.secure_url);

        if (successfulUploads.length === 0) {
            logger.error("All file uploads failed", { uploadResults });
            throw new ApiError(500, "Failed to upload any attachments");
        }

        // Prepare attachments data
        const newAttachments = successfulUploads.map(result => ({
            url: result.secure_url,
            publicId: result.public_id,
            resourceType: result.resource_type
        }));

        // Update the service request with new attachments
        const updatedRequest = await ClientServiceRequest.findByIdAndUpdate(
            requestId,
            { $push: { attachments: { $each: newAttachments } } },
            { new: true, session }
        );

        await session.commitTransaction();

        logger.info(`Successfully added ${newAttachments.length} files to request ${requestId}`, {
            attachmentTypes: newAttachments.map(a => a.resourceType)
        });

        return res.status(200).json(
            new ApiResponse(200, { attachments: updatedRequest.attachments }, "Attachments uploaded and saved successfully")
        );

    } catch (error) {
        await session.abortTransaction();
        logger.error(`Attachment upload failed: ${error.message}`, {
            clientId: req.client?._id,
            stack: error.stack,
            errorDetails: error.response?.data || error
        });

        if (error instanceof ApiError) throw error;
        throw new ApiError(500, "Attachment upload failed");
    } finally {
        session.endSession();
    }
});

// Delete service request attachment from both Cloudinary and database
const deleteServiceRequestAttachment = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { requestId, publicId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(requestId)) {
            logger.warn("Invalid request ID format", { requestId });
            throw new ApiError(400, "Invalid request ID format");
        }

        if (!publicId || typeof publicId !== 'string') {
            logger.warn("Invalid publicId provided", { publicId });
            throw new ApiError(400, "Valid attachment public ID is required");
        }

        logger.info(`Deleting attachment ${publicId} from request ${requestId}`);

        // Find the request and verify ownership
        const serviceRequest = await ClientServiceRequest.findOne({
            _id: requestId,
            createdBy: req.client._id
        }).session(session);

        if (!serviceRequest) {
            logger.warn("Service request not found or unauthorized", { requestId });
            throw new ApiError(404, "Service request not found");
        }

        // Find the specific attachment
        const attachment = serviceRequest.attachments.find(
            att => att.publicId === publicId
        );

        if (!attachment) {
            logger.warn("Attachment not found in request", { publicId, requestId });
            throw new ApiError(404, "Attachment not found in this request");
        }

        // Determine resource type from the attachment
        let resourceType = 'image'; // default
        if (attachment.resourceType) {
            resourceType = attachment.resourceType === 'raw' ? 'raw' :
                attachment.resourceType === 'video' ? 'video' : 'image';
        }

        // Delete from Cloudinary with proper resource type
        const deletionResult = await deleteFromCloudinary(publicId, resourceType);

        if (deletionResult?.result !== 'ok') {
            logger.error("Failed to delete from Cloudinary", { deletionResult });
            throw new ApiError(500, "Failed to delete attachment from storage");
        }

        // Remove from database
        const updatedRequest = await ClientServiceRequest.findByIdAndUpdate(
            requestId,
            { $pull: { attachments: { publicId } } },
            { new: true, session }
        );

        await session.commitTransaction();

        logger.info(`Successfully deleted attachment ${publicId} from request ${requestId}`);

        return res.status(200).json(
            new ApiResponse(200, { attachments: updatedRequest.attachments }, "Attachment deleted successfully")
        );

    } catch (error) {
        await session.abortTransaction();
        logger.error(`Attachment deletion failed: ${error.message}`, {
            publicId: req.params.publicId,
            requestId: req.params.requestId,
            clientId: req.client?._id,
            stack: error.stack
        });

        if (error instanceof ApiError) throw error;
        throw new ApiError(500, "Attachment deletion failed");
    } finally {
        session.endSession();
    }
});
// Create a new service request
const createServiceRequest = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { title, description, category, features, budget, deliveryDeadline, attachments } = req.body;

        logger.info(`Creating service request for client ${req.client._id}`, {
            title,
            category,
            hasAttachments: !!attachments
        });

        // Validate required fields
        if (!areRequiredFieldsProvided([title, description])) {
            logger.warn("Missing required fields", { title, description });
            throw new ApiError(400, "Title and description are required");
        }

        // Validate category
        const validCategories = ClientServiceRequest.schema.path('category').enumValues;
        if (category && !validCategories.includes(category)) {
            logger.warn("Invalid category provided", { category, validCategories });
            throw new ApiError(400, `Invalid service category. Valid values: ${validCategories.join(', ')}`);
        }

        // Validate budget
        if (budget && (isNaN(Number(budget)) || Number(budget) < 0)) {
            logger.warn("Invalid budget provided", { budget });
            throw new ApiError(400, "Budget must be a positive number");
        }

        // Validate delivery deadline
        if (deliveryDeadline && new Date(deliveryDeadline) < new Date()) {
            logger.warn("Invalid delivery deadline", { deliveryDeadline });
            throw new ApiError(400, "Delivery deadline must be in the future");
        }

        // Validate attachments
        let parsedAttachments = [];
        if (attachments) {
            try {
                parsedAttachments = Array.isArray(attachments) ? attachments : JSON.parse(attachments);
                if (!Array.isArray(parsedAttachments)) {
                    throw new Error("Attachments must be an array");
                }
            } catch (error) {
                logger.warn("Invalid attachments format", { attachments, error: error.message });
                throw new ApiError(400, "Invalid attachments format");
            }
        }

        // Create service request
        const [serviceRequest] = await ClientServiceRequest.create([{
            title,
            description,
            category: category || "custom",
            features: Array.isArray(features) ? features : [],
            budget: budget ? Number(budget) : undefined,
            deliveryDeadline: deliveryDeadline ? new Date(deliveryDeadline) : undefined,
            attachments: parsedAttachments,
            createdBy: req.client._id,
            status: "pending"
        }], { session });

        // Update client's service requests
        await Client.findByIdAndUpdate(
            req.client._id,
            { $push: { serviceRequests: serviceRequest._id } },
            { session }
        );

        await session.commitTransaction();
        logger.info(`Service request ${serviceRequest._id} created successfully`);

        const populatedRequest = await ClientServiceRequest.findById(serviceRequest._id)
            .populate('createdBy', 'fullName email phone');

        return res.status(201).json(
            new ApiResponse(201, populatedRequest, "Service request created successfully")
        );

    } catch (error) {
        await session.abortTransaction();
        logger.error(`Service request creation failed: ${error.message}`, {
            clientId: req.client?._id,
            stack: error.stack,
            errorDetails: error.response?.data || error
        });

        if (error instanceof ApiError) throw error;
        if (error.name === "ValidationError") throw new ApiError(400, error.message);
        throw new ApiError(500, "Service request creation failed");
    } finally {
        session.endSession();
    }
});

// Get all service requests for a client
const getClientServiceRequests = asyncHandler(async (req, res) => {
    try {
        const { status, category, sortBy } = req.query;
        const clientId = req.client._id;

        logger.info(`Fetching service requests for client ${clientId}`, {
            status,
            category,
            sortBy
        });

        // Build query
        const query = { createdBy: clientId };

        // Validate status filter
        const validStatuses = ClientServiceRequest.schema.path('status').enumValues;
        if (status && !validStatuses.includes(status)) {
            logger.warn("Invalid status filter", { status, validStatuses });
            throw new ApiError(400, `Invalid status. Valid values: ${validStatuses.join(', ')}`);
        }
        if (status) query.status = status;

        // Validate category filter
        const validCategories = ClientServiceRequest.schema.path('category').enumValues;
        if (category && !validCategories.includes(category)) {
            logger.warn("Invalid category filter", { category, validCategories });
            throw new ApiError(400, `Invalid category. Valid values: ${validCategories.join(', ')}`);
        }
        if (category) query.category = category;

        // Build sort options
        const sortOptions = {};
        const validSortFields = ['createdAt', 'updatedAt', 'budget', 'deliveryDeadline'];

        if (sortBy) {
            const [field, order] = sortBy.split(':');
            if (!validSortFields.includes(field)) {
                logger.warn("Invalid sort field", { field, validSortFields });
                throw new ApiError(400, `Invalid sort field. Valid fields: ${validSortFields.join(', ')}`);
            }
            sortOptions[field] = order === 'desc' ? -1 : 1;
        } else {
            sortOptions.createdAt = -1; // Default: newest first
        }

        const requests = await ClientServiceRequest.find(query)
            .sort(sortOptions)
            .populate('createdBy', 'fullName email phone');

        logger.info(`Found ${requests.length} service requests for client ${clientId}`);

        return res.status(200).json(
            new ApiResponse(200, requests, "Service requests retrieved successfully")
        );

    } catch (error) {
        logger.error(`Failed to fetch service requests: ${error.message}`, {
            clientId: req.client?._id,
            stack: error.stack
        });

        if (error instanceof ApiError) throw error;
        throw new ApiError(500, "Failed to retrieve service requests");
    }
});

// Get a single service request by ID
const getServiceRequestById = asyncHandler(async (req, res) => {
    try {
        const { requestId } = req.params;
        const clientId = req.client._id;

        if (!mongoose.Types.ObjectId.isValid(requestId)) {
            logger.warn("Invalid request ID format", { requestId });
            throw new ApiError(400, "Invalid request ID format");
        }

        logger.info(`Fetching service request ${requestId} for client ${clientId}`);

        const serviceRequest = await ClientServiceRequest.findOne({
            _id: requestId,
            createdBy: clientId
        }).populate('createdBy', 'fullName email phone');

        if (!serviceRequest) {
            logger.warn("Service request not found", { requestId, clientId });
            throw new ApiError(404, "Service request not found");
        }

        logger.info(`Successfully retrieved service request ${requestId}`);

        return res.status(200).json(
            new ApiResponse(200, serviceRequest, "Service request retrieved successfully")
        );

    } catch (error) {
        logger.error(`Failed to fetch service request: ${error.message}`, {
            requestId: req.params.requestId,
            clientId: req.client?._id,
            stack: error.stack
        });

        if (error instanceof ApiError) throw error;
        throw new ApiError(500, "Failed to retrieve service request");
    }
});

// Update a service request
const updateServiceRequest = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { requestId } = req.params;
        const clientId = req.client._id;
        const updateData = req.body;

        if (!mongoose.Types.ObjectId.isValid(requestId)) {
            logger.warn("Invalid request ID format", { requestId });
            throw new ApiError(400, "Invalid request ID format");
        }

        logger.info(`Updating service request ${requestId} for client ${clientId}`, {
            updateFields: Object.keys(updateData)
        });

        // Find existing request
        const existingRequest = await ClientServiceRequest.findOne({
            _id: requestId,
            createdBy: clientId
        }).session(session);

        if (!existingRequest) {
            logger.warn("Service request not found for update", { requestId, clientId });
            throw new ApiError(404, "Service request not found");
        }

        // Validate status transition
        if (!["pending", "under-review"].includes(existingRequest.status)) {
            logger.warn("Invalid status for update", {
                currentStatus: existingRequest.status,
                allowedStatuses: ["pending", "under-review"]
            });
            throw new ApiError(400, "Only pending or under-review requests can be updated");
        }

        // Prepare update object with validation
        const updateObject = {};

        // Title update
        if (updateData.title !== undefined) {
            if (!updateData.title || typeof updateData.title !== 'string') {
                throw new ApiError(400, "Title must be a non-empty string");
            }
            updateObject.title = updateData.title;
        }

        // Description update
        if (updateData.description !== undefined) {
            if (!updateData.description || typeof updateData.description !== 'string') {
                throw new ApiError(400, "Description must be a non-empty string");
            }
            updateObject.description = updateData.description;
        }

        // Category update
        if (updateData.category !== undefined) {
            const validCategories = ClientServiceRequest.schema.path('category').enumValues;
            if (!validCategories.includes(updateData.category)) {
                logger.warn("Invalid category update", { category: updateData.category });
                throw new ApiError(400, `Invalid category. Valid values: ${validCategories.join(', ')}`);
            }
            updateObject.category = updateData.category;
        }

        // Features update
        if (updateData.features !== undefined) {
            try {
                const features = Array.isArray(updateData.features)
                    ? updateData.features
                    : JSON.parse(updateData.features);

                if (!Array.isArray(features)) {
                    throw new Error("Features must be an array");
                }
                updateObject.features = features;
            } catch (error) {
                logger.warn("Invalid features format", { error: error.message });
                throw new ApiError(400, "Invalid features format");
            }
        }

        // Budget update
        if (updateData.budget !== undefined) {
            const budget = Number(updateData.budget);
            if (isNaN(budget) || budget < 0) {
                logger.warn("Invalid budget update", { budget: updateData.budget });
                throw new ApiError(400, "Budget must be a positive number");
            }
            updateObject.budget = budget;
        }

        // Delivery deadline update
        if (updateData.deliveryDeadline !== undefined) {
            const deadline = new Date(updateData.deliveryDeadline);
            if (isNaN(deadline.getTime()) || deadline < new Date()) {
                logger.warn("Invalid delivery deadline update", { deadline: updateData.deliveryDeadline });
                throw new ApiError(400, "Delivery deadline must be a valid future date");
            }
            updateObject.deliveryDeadline = deadline;
        }

        // Attachments update
        if (updateData.attachments !== undefined) {
            try {
                const attachments = Array.isArray(updateData.attachments)
                    ? updateData.attachments
                    : JSON.parse(updateData.attachments);

                if (!Array.isArray(attachments)) {
                    throw new Error("Attachments must be an array");
                }
                updateObject.attachments = attachments;
            } catch (error) {
                logger.warn("Invalid attachments format", { error: error.message });
                throw new ApiError(400, "Invalid attachments format");
            }
        }

        // Reset status to pending when updating
        updateObject.status = "pending";

        // Perform the update
        const updatedRequest = await ClientServiceRequest.findByIdAndUpdate(
            requestId,
            updateObject,
            { new: true, session }
        ).populate('createdBy', 'fullName email phone');

        await session.commitTransaction();
        logger.info(`Service request ${requestId} updated successfully`);

        return res.status(200).json(
            new ApiResponse(200, updatedRequest, "Service request updated successfully")
        );

    } catch (error) {
        await session.abortTransaction();
        logger.error(`Failed to update service request: ${error.message}`, {
            requestId: req.params.requestId,
            clientId: req.client?._id,
            stack: error.stack,
            errorDetails: error.response?.data || error
        });

        if (error instanceof ApiError) throw error;
        if (error.name === "ValidationError") throw new ApiError(400, error.message);
        throw new ApiError(500, "Failed to update service request");
    } finally {
        session.endSession();
    }
});

// Delete a service request
const deleteServiceRequest = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { requestId } = req.params;
        const clientId = req.client._id;

        if (!mongoose.Types.ObjectId.isValid(requestId)) {
            logger.warn("Invalid request ID format for deletion", { requestId });
            throw new ApiError(400, "Invalid request ID format");
        }

        logger.info(`Deleting service request ${requestId} for client ${clientId}`);

        // Find request with attachments
        const requestToDelete = await ClientServiceRequest.findOne({
            _id: requestId,
            createdBy: clientId
        }).session(session);

        if (!requestToDelete) {
            logger.warn("Service request not found for deletion", { requestId, clientId });
            throw new ApiError(404, "Service request not found");
        }

        // Validate status for deletion
        if (!["pending", "under-review"].includes(requestToDelete.status)) {
            logger.warn("Invalid status for deletion", {
                currentStatus: requestToDelete.status,
                allowedStatuses: ["pending", "under-review"]
            });
            throw new ApiError(400, "Only pending or under-review requests can be deleted");
        }

        // Delete attachments from Cloudinary
        if (requestToDelete.attachments?.length > 0) {
            logger.info(`Deleting ${requestToDelete.attachments.length} attachments for request ${requestId}`);

            const deleteResults = await Promise.allSettled(
                requestToDelete.attachments
                    .filter(att => att.publicId)
                    .map(att => deleteFromCloudinary(att.publicId))
            );

            // Log any failed deletions but don't fail the operation
            deleteResults.forEach((result, index) => {
                if (result.status === 'rejected') {
                    logger.error(`Failed to delete attachment ${requestToDelete.attachments[index].publicId}`, {
                        error: result.reason
                    });
                }
            });
        }

        // Delete the request
        await ClientServiceRequest.deleteOne({ _id: requestId }).session(session);

        // Remove reference from client
        await Client.findByIdAndUpdate(
            clientId,
            { $pull: { serviceRequests: requestId } },
            { session }
        );

        await session.commitTransaction();
        logger.info(`Successfully deleted service request ${requestId}`);

        return res.status(200).json(
            new ApiResponse(200, {}, "Service request deleted successfully")
        );

    } catch (error) {
        await session.abortTransaction();
        logger.error(`Failed to delete service request: ${error.message}`, {
            requestId: req.params.requestId,
            clientId: req.client?._id,
            stack: error.stack
        });

        if (error instanceof ApiError) throw error;
        throw new ApiError(500, "Failed to delete service request");
    } finally {
        session.endSession();
    }
});

// Admin-only: Get all service requests
const getAllServiceRequests = asyncHandler(async (req, res) => {
    try {
        if (req.client.role !== 'admin') {
            logger.warn(`Unauthorized access attempt by client ${req.client._id}`);
            throw new ApiError(403, "Unauthorized access");
        }

        const { status, category, clientId, sortBy, page = 1, limit = 10 } = req.query;

        logger.info(`Admin fetching all service requests`, {
            filters: { status, category, clientId },
            pagination: { page, limit }
        });

        // Build query
        const query = {};

        // Status filter
        const validStatuses = ClientServiceRequest.schema.path('status').enumValues;
        if (status) {
            if (!validStatuses.includes(status)) {
                logger.warn("Invalid status filter", { status, validStatuses });
                throw new ApiError(400, `Invalid status. Valid values: ${validStatuses.join(', ')}`);
            }
            query.status = status;
        }

        // Category filter
        const validCategories = ClientServiceRequest.schema.path('category').enumValues;
        if (category) {
            if (!validCategories.includes(category)) {
                logger.warn("Invalid category filter", { category, validCategories });
                throw new ApiError(400, `Invalid category. Valid values: ${validCategories.join(', ')}`);
            }
            query.category = category;
        }

        // Client filter
        if (clientId) {
            if (!mongoose.Types.ObjectId.isValid(clientId)) {
                logger.warn("Invalid client ID filter", { clientId });
                throw new ApiError(400, "Invalid client ID");
            }
            query.createdBy = clientId;
        }

        // Build sort options
        const sortOptions = {};
        const validSortFields = ['createdAt', 'updatedAt', 'budget', 'deliveryDeadline'];

        if (sortBy) {
            const [field, order] = sortBy.split(':');
            if (!validSortFields.includes(field)) {
                logger.warn("Invalid sort field", { field, validSortFields });
                throw new ApiError(400, `Invalid sort field. Valid fields: ${validSortFields.join(', ')}`);
            }
            sortOptions[field] = order === 'desc' ? -1 : 1;
        } else {
            sortOptions.createdAt = -1; // Default: newest first
        }

        // Pagination
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const [requests, total] = await Promise.all([
            ClientServiceRequest.find(query)
                .sort(sortOptions)
                .skip(skip)
                .limit(limitNum)
                .populate('createdBy', 'fullName email phone'),
            ClientServiceRequest.countDocuments(query)
        ]);

        logger.info(`Admin retrieved ${requests.length} of ${total} service requests`);

        return res.status(200).json(
            new ApiResponse(200, {
                requests,
                total,
                page: pageNum,
                pages: Math.ceil(total / limitNum),
                limit: limitNum
            }, "Service requests retrieved successfully")
        );

    } catch (error) {
        logger.error(`Admin failed to fetch service requests: ${error.message}`, {
            clientId: req.client?._id,
            stack: error.stack
        });

        if (error instanceof ApiError) throw error;
        throw new ApiError(500, "Failed to retrieve service requests");
    }
});

// Admin-only: Update service request status
const updateServiceRequestStatus = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        if (req.client.role !== 'admin') {
            logger.warn(`Unauthorized status update attempt by client ${req.client._id}`);
            throw new ApiError(403, "Unauthorized access");
        }

        const { requestId } = req.params;
        const { status, adminNotes } = req.body;

        if (!mongoose.Types.ObjectId.isValid(requestId)) {
            logger.warn("Invalid request ID format for status update", { requestId });
            throw new ApiError(400, "Invalid request ID format");
        }

        logger.info(`Admin updating status of request ${requestId} to ${status}`);

        // Validate status
        const validStatuses = ClientServiceRequest.schema.path('status').enumValues;
        if (!status || !validStatuses.includes(status)) {
            logger.warn("Invalid status provided", { status, validStatuses });
            throw new ApiError(400, `Invalid status. Valid values: ${validStatuses.join(', ')}`);
        }

        // Prepare update
        const update = { status };
        if (adminNotes) {
            if (typeof adminNotes !== 'string') {
                throw new ApiError(400, "Admin notes must be a string");
            }
            update.adminNotes = adminNotes;
        }

        // Perform update
        const updatedRequest = await ClientServiceRequest.findByIdAndUpdate(
            requestId,
            update,
            { new: true, session }
        ).populate('createdBy', 'fullName email phone');

        if (!updatedRequest) {
            logger.warn("Service request not found for status update", { requestId });
            throw new ApiError(404, "Service request not found");
        }

        await session.commitTransaction();
        logger.info(`Successfully updated status of request ${requestId} to ${status}`);

        return res.status(200).json(
            new ApiResponse(200, updatedRequest, "Service request status updated successfully")
        );

    } catch (error) {
        await session.abortTransaction();
        logger.error(`Admin failed to update service request status: ${error.message}`, {
            requestId: req.params.requestId,
            clientId: req.client?._id,
            stack: error.stack
        });

        if (error instanceof ApiError) throw error;
        throw new ApiError(500, "Failed to update service request status");
    } finally {
        session.endSession();
    }
});

export {
    uploadServiceRequestAttachments,
    deleteServiceRequestAttachment,
    createServiceRequest,
    getClientServiceRequests,
    getServiceRequestById,
    updateServiceRequest,
    deleteServiceRequest,
    getAllServiceRequests,
    updateServiceRequestStatus
};