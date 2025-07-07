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
} from "../controllers/services.controller.js";
import { upload } from "../middlewares/multler.middlewares.js";

const router = express.Router();

// Protected routes (require valid admin access token)
router.use(verifyAdminJwt);

router.route("/")
    .get(getAllServices); // GET /api/v1/services

router.route("/:serviceId")
    .get(getServiceById); // GET /api/v1/services/:serviceId


router.route("/")
    .post(createService); // POST /api/v1/services

router.route("/:serviceId")
    .patch(updateService) // PATCH /api/v1/services/:serviceId
    .delete(deleteService); // DELETE /api/v1/services/:serviceId

router.route("/:serviceId/toggle-status")
    .patch(toggleServiceStatus); // PATCH /api/v1/services/:serviceId/toggle-status

// Thumbnail upload routes
router.route("/:serviceId/thumbnail")
    .post(
        upload.single("thumbnail"),
        uploadThumbnail
    ) // POST /api/v1/services/:serviceId/thumbnail

export default router;