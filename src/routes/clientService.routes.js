import { Router } from "express";
import {
    uploadServiceRequestAttachments,
    deleteServiceRequestAttachment,
    createServiceRequest,
    getClientServiceRequests,
    getServiceRequestById,
    updateServiceRequest,
    deleteServiceRequest,
    getAllServiceRequests,
    updateServiceRequestStatus
} from "../controllers/clientService.controller.js";
import { upload } from "../middlewares/multler.middlewares.js";
import { verifyJwt } from "../middlewares/auth.middlewares.js";
import { authRateLimiter } from "../middlewares/ratelimit.middleware.js";

const router = Router();

// Apply JWT verification to all service request routes
router.use(verifyJwt);

router.route('/:requestId/attachments')
    .post(verifyJwt, upload.array('attachments'), uploadServiceRequestAttachments);

router.route('/:requestId/attachments/:publicId')
    .delete(verifyJwt, deleteServiceRequestAttachment);
// Client service request routes
router.route("/")
    .post(authRateLimiter, createServiceRequest) // Create new service request
    .get(authRateLimiter, getClientServiceRequests); // Get all client's service requests

router.route("/:requestId")
    .get(authRateLimiter, getServiceRequestById) // Get single service request
    .patch(authRateLimiter, updateServiceRequest) // Update service request
    .delete(authRateLimiter, deleteServiceRequest); // Delete service request

// Admin-only routes
router.route("/admin/all")
    .get(authRateLimiter, getAllServiceRequests); // Get all service requests (admin)

router.route("/admin/:requestId/status")
    .patch(authRateLimiter, updateServiceRequestStatus); // Update request status (admin)

export default router;