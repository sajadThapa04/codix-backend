import { Router } from "express";
import {
    createCareerApplication,
    getAllCareerApplications,
    updateApplicationStatus,
    deleteCareerApplication,
} from "../controllers/career.controller.js";
import { verifyAdminJwt } from "../middlewares/admin.auth.middlewares.js";
import { verifyJwt } from "../middlewares/auth.middlewares.js";
import { upload } from "../middlewares/multler.middlewares.js";
import { authRateLimiter } from "../middlewares/ratelimit.middleware.js";

const router = Router();

// Public career application route
router.post(
    "/",
    authRateLimiter,
    upload.single("resume"),
    createCareerApplication
);



// Admin protected routes
router.use(verifyAdminJwt); // Applies to all routes below

router.get("/", authRateLimiter, getAllCareerApplications);
router.patch("/:id/status", authRateLimiter, updateApplicationStatus);
router.delete("/:id", authRateLimiter, deleteCareerApplication);

export default router;