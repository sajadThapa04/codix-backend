import asyncHandler from "../utils/asyncHandler.utils.js";
import { ApiError } from "../utils/ApiError.utils.js";
import ApiResponse from "../utils/ApiResponse.utils.js";
import mongoose from "mongoose";
import logger from "../utils/logger.utils.js";
import Admin from "../models/admin.model.js";
import Contact from "../models/contact.models.js";
import Client from "../models/client.model.js";
import { isEmailValid, areRequiredFieldsProvided } from "../utils/validator.utils.js";

// @desc    Create a new contact request
// @route   POST /api/contacts
// @access  Public
const createContact = asyncHandler(async (req, res) => {
    try {
        // Extract required fields
        const { fullName, email, subject, message } = req.body;

        // Validate fields
        const fieldValues = [fullName, email, subject, message];
        if (!areRequiredFieldsProvided(fieldValues)) {
            logger.warn('Missing required fields in public contact creation', { fields: req.body });
            throw new ApiError(400, "Missing required fields: fullName, email, subject, message");
        }

        if (!isEmailValid(email)) {
            logger.warn('Invalid email in public contact creation', { email });
            throw new ApiError(400, "Invalid email format");
        }

        // Create contact (explicitly no client association)
        const contact = await Contact.create({
            fullName: fullName.trim(),
            email: email.trim().toLowerCase(),
            subject: subject.trim(),
            message: message.trim(),
            phone: req.body.phone?.trim() || "",
            country: req.body.country?.trim() || "",
            ipAddress: req.ip,
            client: null // Explicitly set to null
        });

        logger.info('Public contact created successfully', {
            contactId: contact._id,
            email: contact.email
        });

        return res.status(201).json(
            new ApiResponse(201, contact, "Contact request submitted successfully")
        );
    } catch (error) {
        logger.error('Public contact creation failed', {
            error: error.message,
            stack: error.stack,
            body: req.body
        });

        if (error.code === 11000) {
            throw new ApiError(400, "Duplicate contact entry detected");
        }
        throw error;
    }
});

// For authenticated clients only
const createAuthenticatedContact = asyncHandler(async (req, res) => {
    try {
        // Verify authentication
        if (!req.client?._id) {
            logger.warn('Unauthenticated access to authenticated contact endpoint');
            throw new ApiError(401, "Authentication required");
        }

        // Extract required fields
        const { fullName, email, subject, message } = req.body;

        // Validate fields
        const fieldValues = [fullName, email, subject, message];
        if (!areRequiredFieldsProvided(fieldValues)) {
            logger.warn('Missing fields in authenticated contact', {
                clientId: req.client._id,
                fields: req.body
            });
            throw new ApiError(400, "Missing required fields");
        }

        if (!isEmailValid(email)) {
            logger.warn('Invalid email in authenticated contact', {
                clientId: req.client._id,
                email
            });
            throw new ApiError(400, "Invalid email format");
        }

        // Verify client exists
        const clientExists = await Client.exists({ _id: req.client._id });
        if (!clientExists) {
            logger.error('Client not found for authenticated contact', {
                clientId: req.client._id
            });
            throw new ApiError(404, "Client account not found");
        }

        // Create contact with client association
        const contact = await Contact.create({
            fullName: fullName.trim(),
            email: email.trim().toLowerCase(),
            subject: subject.trim(),
            message: message.trim(),
            phone: req.body.phone?.trim() || "",
            country: req.body.country?.trim() || "",
            ipAddress: req.ip,
            client: req.client._id // Explicit client association
        });

        logger.info('Authenticated contact created', {
            contactId: contact._id,
            clientId: req.client._id,
            email: contact.email
        });

        return res.status(201).json(
            new ApiResponse(201, contact, "Contact request submitted successfully")
        );
    } catch (error) {
        logger.error('Authenticated contact creation failed', {
            clientId: req.client?._id || 'unauthorized',
            error: error.message,
            stack: error.stack,
            body: req.body
        });

        if (error.code === 11000) {
            throw new ApiError(400, "Duplicate contact entry detected");
        }
        throw error;
    }
});
// @desc    Get all contact requests (admin only)
// @route   GET /api/contacts
// @access  Private/Admin
const getAllContacts = asyncHandler(async (req, res) => {
    try {
        // Check admin permissions
        if (req.admin?.role !== "admin" && !req.admin?.permissions?.manageContacts) {
            logger.warn('Unauthorized admin access attempt', { adminId: req.admin?._id });
            throw new ApiError(403, "Unauthorized: Insufficient permissions");
        }

        // Parse query parameters
        const { status = "pending", page = 1, limit = 10, sort = "-createdAt", search } = req.query;

        // Validate status
        if (!["pending", "resolved", "closed", "all"].includes(status)) {
            throw new ApiError(400, "Invalid status value");
        }

        // Build query
        const query = {};
        if (status !== "all") query.status = status;

        // Add search functionality
        if (search) {
            query.$or = [
                { fullName: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { subject: { $regex: search, $options: "i" } }
            ];
        }

        // Pagination options
        const options = {
            page: parseInt(page),
            limit: parseInt(limit),
            sort,
            populate: [
                { path: "client", select: "fullName email phone" },
                { path: "respondedBy", select: "fullName email" }
            ]
        };

        // Execute query
        const result = await Contact.paginate(query, options);

        logger.info('Admin retrieved contacts', {
            adminId: req.admin._id,
            count: result.docs.length,
            status: status
        });

        return res.status(200).json(
            new ApiResponse(200, {
                contacts: result.docs,
                total: result.totalDocs,
                pages: result.totalPages,
                currentPage: result.page
            }, "Contacts retrieved successfully")
        );
    } catch (error) {
        logger.error('Failed to retrieve contacts', {
            adminId: req.admin?._id,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
});

// @desc    Get a single contact request (admin or owner)
// @route   GET /api/contacts/:id
// @access  Private
const getContactById = asyncHandler(async (req, res) => {
    // Validate ID
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        throw new ApiError(400, "Invalid contact ID");
    }

    // Find contact
    const contact = await Contact.findById(req.params.id)
        .populate("client", "fullName email phone")
        .populate("respondedBy", "fullName email");

    if (!contact) {
        throw new ApiError(404, "Contact not found");
    }

    // Check permissions
    const isAdmin = req.admin.role === "admin" || req.admin.permissions?.manageContacts;
    const isOwner = contact.client && contact.client._id.equals(req.admin._id);

    if (!isAdmin && !isOwner) {
        throw new ApiError(403, "Unauthorized: You can only view your own contact requests");
    }

    return res.status(200).json(
        new ApiResponse(200, contact, "Contact retrieved successfully")
    );
});

// @desc    Update a contact request (admin only)
// @route   PUT /api/contacts/:id
// @access  Private/Admin
const updateContact = asyncHandler(async (req, res) => {
    try {
        // Check admin permissions
        if (!req.admin || (req.admin.role !== "admin" && !req.admin.permissions?.manageContacts)) {
            logger.warn('Unauthorized update attempt', {
                adminId: req.admin?._id,
                contactId: req.params.id
            });
            throw new ApiError(403, "Unauthorized: Insufficient permissions");
        }

        // Validate ID
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            throw new ApiError(400, "Invalid contact ID");
        }

        // Prepare complete update data including all editable fields
        const updateData = {
            fullName: req.body.fullName,
            email: req.body.email,
            subject: req.body.subject,
            message: req.body.message,
            phone: req.body.phone,
            country: req.body.country,
            status: req.body.status,
            responseMessage: req.body.responseMessage,
            isArchived: req.body.isArchived,
            respondedBy: req.admin._id,
            updatedAt: new Date()
        };

        // Remove undefined fields to prevent overwriting with null
        Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

        // Find and update contact
        const contact = await Contact.findByIdAndUpdate(
            req.params.id,
            updateData,
            {
                new: true,
                runValidators: true,
                context: 'query',
                populate: [
                    { path: "client", select: "fullName email phone" },
                    { path: "respondedBy", select: "fullName email" }
                ]
            }
        );

        if (!contact) {
            logger.error('Contact not found for update', { contactId: req.params.id });
            throw new ApiError(404, "Contact not found");
        }

        logger.info('Contact updated successfully', {
            contactId: contact._id,
            adminId: req.admin._id,
            updates: updateData
        });

        return res.status(200).json(
            new ApiResponse(200, contact, "Contact updated successfully")
        );
    } catch (error) {
        logger.error('Failed to update contact', {
            adminId: req.admin?._id,
            contactId: req.params.id,
            error: error.message,
            stack: error.stack,
            requestBody: req.body
        });

        if (error.code === 11000) {
            throw new ApiError(400, "Duplicate contact entry detected");
        }
        throw new ApiError(500, "Failed to update contact: " + error.message);
    }
});
// @desc    Delete a contact request (admin only)
// @route   DELETE /api/contacts/:id
// @access  Private/Admin
const deleteContact = asyncHandler(async (req, res) => {
    try {
        // Check admin permissions
        if (req.admin?.role !== "admin" && !req.admin?.permissions?.manageContacts) {
            logger.warn('Unauthorized delete attempt', {
                adminId: req.admin?._id,
                contactId: req.params.id
            });
            throw new ApiError(403, "Unauthorized: Insufficient permissions");
        }

        // Validate ID
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            throw new ApiError(400, "Invalid contact ID");
        }

        // Find and delete contact
        const contact = await Contact.findByIdAndDelete(req.params.id);

        if (!contact) {
            logger.error('Contact not found for deletion', { contactId: req.params.id });
            throw new ApiError(404, "Contact not found");
        }

        logger.info('Contact deleted successfully', {
            contactId: req.params.id,
            adminId: req.admin._id,
            deletedAt: new Date()
        });

        return res.status(200).json(
            new ApiResponse(200, null, "Contact deleted successfully")
        );
    } catch (error) {
        logger.error('Failed to delete contact', {
            adminId: req.admin?._id,
            contactId: req.params.id,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
});
// @desc    Get contact requests for current client
// @route   GET /api/contacts/client/me
// @access  Private/Client
const getMyContacts = asyncHandler(async (req, res) => {
    try {
        // Only clients can access their own contacts
        if (req.client?.role !== "client") {
            throw new ApiError(403, "Unauthorized: Only clients can access their own contacts");
        }

        // Parse query parameters
        const { status, page = 1, limit = 10 } = req.query;

        // Build query
        const query = { client: req.client._id };
        if (status && ["pending", "resolved", "closed"].includes(status)) {
            query.status = status;
        }

        // Pagination options
        const options = {
            page: parseInt(page),
            limit: parseInt(limit),
            sort: "-createdAt",
            lean: true // Returns plain JavaScript objects instead of Mongoose documents
        };

        // Execute paginated query
        const result = await Contact.paginate(query, options);

        logger.info(`Retrieved contacts for client ${req.client._id}`, {
            count: result.docs.length,
            page: result.page
        });

        return res.status(200).json(
            new ApiResponse(200, {
                contacts: result.docs,
                total: result.totalDocs,
                pages: result.totalPages,
                currentPage: result.page
            }, "Your contacts retrieved successfully")
        );
    } catch (error) {
        logger.error('Failed to retrieve contacts', {
            clientId: req.client?._id,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
});
export {
    createContact,
    createAuthenticatedContact,
    getAllContacts,
    getContactById,
    updateContact,
    deleteContact,
    getMyContacts
};