import { Router } from "express";
import {
    verifyAdminJwt,
    verifyAdminRefreshToken
} from "../middlewares/admin.auth.middlewares.js";
import {
    authRateLimiter,
    strictAuthRateLimiter
} from "../middlewares/ratelimit.middleware.js";
import {
    getAllClients,
    getClientById,
    updateClient,
    deleteClient,
    getAllBlogs,
    getBlogById,
    deleteBlog,
    changeBlogStatus,
    toggleBlogFeatured
} from "../controllers/adminDashboard.controller.js";

const router = Router();

// Apply rate limiting to all routes
router.use(authRateLimiter);

// Verify admin JWT for all routes below
router.use(verifyAdminJwt);

// Client management routes
router.route("/clients")
    .get(getAllClients);

router.route("/clients/:id")
    .get(getClientById)
    .patch(updateClient)
    .delete(strictAuthRateLimiter, deleteClient);

// Blog management routes
router.route("/blogs")
    .get(getAllBlogs);

router.route("/blogs/:id")
    .get(getBlogById)
    .delete(strictAuthRateLimiter, deleteBlog);

router.route("/blogs/:id/status")
    .patch(changeBlogStatus);

router.route("/blogs/:id/toggle")
    .patch(toggleBlogFeatured);

export default router;