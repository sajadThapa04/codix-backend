import asyncHandler from "../utils/asyncHandler.utils.js";
import { ApiError } from "../utils/ApiError.utils.js";
import ApiResponse from "../utils/ApiResponse.utils.js";
import Career from "../models/career.model.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.utils.js";
import { isEmailValid, isPhoneValid } from "../utils/validator.utils.js";
import logger from "../utils/logger.utils.js";

// @desc    Create a new career application
// @route   POST /api/careers
// @access  Public
const createCareerApplication = asyncHandler(async (req, res) => {
    let resume;
    try {
        logger.info('Starting career application creation', { body: req.body });

        // Validate required fields
        const requiredFields = ['fullName', 'email', 'phone', 'positionApplied'];
        const missingFields = requiredFields.filter(field => !req.body[field]?.trim());

        if (missingFields.length > 0) {
            const errorMessage = `Missing required fields: ${missingFields.join(', ')}`;
            logger.warn('Validation failed - missing fields', { missingFields });
            throw new ApiError(400, errorMessage);
        }

        // Validate email format
        if (!isEmailValid(req.body.email)) {
            logger.warn('Validation failed - invalid email', { email: req.body.email });
            throw new ApiError(400, "Please provide a valid email address");
        }

        // Validate phone number
        if (!isPhoneValid(req.body.phone)) {
            logger.warn('Validation failed - invalid phone', { phone: req.body.phone });
            throw new ApiError(400, "Please provide a valid phone number");
        }

        // Check for existing application
        const existingApplication = await Career.findOne({ email: req.body.email.trim().toLowerCase() });
        if (existingApplication) {
            logger.warn('Duplicate application attempt', { email: req.body.email });
            throw new ApiError(409, "You've already submitted an application with this email");
        }

        // Handle file upload
        if (!req.file?.path) {
            logger.warn('Resume file missing in upload');
            throw new ApiError(400, "Resume file is required");
        }

        logger.info('Uploading resume to Cloudinary', { file: req.file });
        resume = await uploadOnCloudinary(req.file.path);
        if (!resume?.url) {
            logger.error('Cloudinary upload failed', { file: req.file });
            throw new ApiError(500, "Failed to upload resume");
        }

        // Create application
        const applicationData = {
            fullName: req.body.fullName.trim(),
            email: req.body.email.trim().toLowerCase(),
            phone: req.body.phone.trim(),
            positionApplied: req.body.positionApplied,
            resume: {
                url: resume.url,
                publicId: resume.public_id
            },
            ...(req.body.coverLetter && { coverLetter: req.body.coverLetter.trim() })
        };

        const application = await Career.create(applicationData);
        logger.info('Career application created successfully', { applicationId: application._id });

        return res.status(201).json(
            new ApiResponse(201, application, "Application submitted successfully")
        );

    } catch (error) {
        // Clean up uploaded file if something failed after upload
        if (resume?.public_id) {
            logger.info('Cleaning up failed upload', { publicId: resume.public_id });
            await deleteFromCloudinary(resume.public_id).catch(err => {
                logger.error('Failed to cleanup Cloudinary file', { error: err.message });
            });
        }

        logger.error('Career application creation failed', {
            error: error.message,
            stack: error.stack,
            body: req.body
        });
        throw error;
    }
});

// @desc    Get all career applications (admin only)
// @route   GET /api/careers
// @access  Private/Admin
const getAllCareerApplications = asyncHandler(async (req, res) => {
    try {
        logger.info('Fetching all career applications', { adminId: req.admin?._id });

        // Check admin permissions
        if (!req.admin) {
            logger.warn('Unauthorized admin access attempt');
            throw new ApiError(403, "Unauthorized: Admin access required");
        }

        const { status, page = 1, limit = 10 } = req.query;
        logger.debug('Query parameters', { status, page, limit });

        const query = {};
        if (status) query.status = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Get total count
        const total = await Career.countDocuments(query);

        // Get paginated results
        const applications = await Career.find(query)
            .sort('-createdAt')
            .skip(skip)
            .limit(parseInt(limit));

        const pages = Math.ceil(total / parseInt(limit));

        logger.info('Successfully fetched applications', { count: total });

        return res.status(200).json(
            new ApiResponse(200, {
                applications,
                total,
                pages,
                currentPage: parseInt(page)
            }, "Applications retrieved successfully")
        );

    } catch (error) {
        logger.error('Failed to fetch career applications', {
            error: error.message,
            stack: error.stack,
            adminId: req.admin?._id
        });
        throw error;
    }
});

// @desc    Update application status (admin only)
// @route   PATCH /api/careers/:id/status
// @access  Private/Admin
const updateApplicationStatus = asyncHandler(async (req, res) => {
    try {
        logger.info('Updating application status', {
            applicationId: req.params.id,
            status: req.body.status,
            adminId: req.admin?._id
        });

        if (!req.admin) {
            logger.warn('Unauthorized admin access attempt');
            throw new ApiError(403, "Unauthorized: Admin access required");
        }

        if (!req.body.status) {
            logger.warn('Status update failed - missing status');
            throw new ApiError(400, "Status is required");
        }

        const application = await Career.findByIdAndUpdate(
            req.params.id,
            { status: req.body.status },
            { new: true }
        );

        if (!application) {
            logger.warn('Application not found for status update', { applicationId: req.params.id });
            throw new ApiError(404, "Application not found");
        }

        logger.info('Application status updated successfully', {
            applicationId: application._id,
            newStatus: application.status
        });

        return res.status(200).json(
            new ApiResponse(200, application, "Status updated successfully")
        );

    } catch (error) {
        logger.error('Failed to update application status', {
            error: error.message,
            stack: error.stack,
            applicationId: req.params.id
        });
        throw error;
    }
});

// @desc    Delete application (admin only)
// @route   DELETE /api/careers/:id
// @access  Private/Admin
const deleteCareerApplication = asyncHandler(async (req, res) => {
    try {
        logger.info('Deleting career application', {
            applicationId: req.params.id,
            adminId: req.admin?._id
        });

        if (!req.admin) {
            logger.warn('Unauthorized admin access attempt');
            throw new ApiError(403, "Unauthorized: Admin access required");
        }

        const application = await Career.findByIdAndDelete(req.params.id);

        if (!application) {
            logger.warn('Application not found for deletion', { applicationId: req.params.id });
            throw new ApiError(404, "Application not found");
        }

        // Delete files from Cloudinary if they exist
        if (application.resume?.publicId) {
            logger.info('Deleting resume from Cloudinary', { publicId: application.resume.publicId });
            await deleteFromCloudinary(application.resume.publicId).catch(err => {
                logger.error('Failed to delete resume from Cloudinary', {
                    publicId: application.resume.publicId,
                    error: err.message
                });
            });
        }

        if (application.coverLetter?.publicId) {
            logger.info('Deleting cover letter from Cloudinary', { publicId: application.coverLetter.publicId });
            await deleteFromCloudinary(application.coverLetter.publicId).catch(err => {
                logger.error('Failed to delete cover letter from Cloudinary', {
                    publicId: application.coverLetter.publicId,
                    error: err.message
                });
            });
        }

        logger.info('Application deleted successfully', { applicationId: req.params.id });
        return res.status(200).json(
            new ApiResponse(200, null, "Application deleted successfully")
        );

    } catch (error) {
        logger.error('Failed to delete application', {
            error: error.message,
            stack: error.stack,
            applicationId: req.params.id
        });
        throw error;
    }
});

// @desc    Get client's own career applications
// @route   GET /api/careers/me
// @access  Private/Client
// @desc    Get client's own career applications
// @route   GET /api/careers/client/me
// @access  Private/Client

// Update the exports at the bottom of the file
export {
    createCareerApplication,
    getAllCareerApplications,
    updateApplicationStatus,
    deleteCareerApplication,
};