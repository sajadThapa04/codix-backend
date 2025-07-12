import { verifyAdminJwt } from "../middlewares/admin.auth.middlewares.js";
import express from "express";
import {
    createService,
    getAllServices,
    getServiceById,
    updateService,
    deleteService,
    toggleServiceStatus,
    uploadThumbnail,
    getActiveServices,
    getActiveServiceById
} from "../controllers/services.controller.js";
import { upload } from "../middlewares/multler.middlewares.js";

const router = express.Router();

// Public routes (no authentication required)
router.route("/public")
    .get(getActiveServices); // GET /api/v1/services/public

router.route("/public/:serviceId")
    .get(getActiveServiceById); // GET /api/v1/services/public/:serviceId

// Protected routes (require valid admin access token)
router.use(verifyAdminJwt);

router.route("/")
    .get(getAllServices) // GET /api/v1/services (admin view)
    .post(createService); // POST /api/v1/services

router.route("/:serviceId")
    .get(getServiceById) // GET /api/v1/services/:serviceId (admin view)
    .patch(updateService) // PATCH /api/v1/services/:serviceId
    .delete(deleteService); // DELETE /api/v1/services/:serviceId

router.route("/:serviceId/toggle-status")
    .patch(toggleServiceStatus); // PATCH /api/v1/services/:serviceId/toggle-status

// Thumbnail upload route
router.route("/:serviceId/thumbnail")
    .post(
        upload.single("thumbnail"),
        uploadThumbnail
    ); // POST /api/v1/services/:serviceId/thumbnail

export default router;