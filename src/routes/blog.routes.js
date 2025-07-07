import Router from "express";
import {
    createBlog,
    getAllBlogs,
    getBlogById,
    updateBlog,
    deleteBlog,
    toggleLike,
    uploadCoverImage,
    getBlogsByAuthor
} from "../controllers/Blog.controller.js";
import { upload } from "../middlewares/multler.middlewares.js";
import { verifyJwt } from "../middlewares/auth.middlewares.js";
import { authRateLimiter } from "../middlewares/ratelimit.middleware.js";

const router = Router();

// Public routes (no authentication required)
router.route("/")
    .get(authRateLimiter, getAllBlogs); // Get all published blogs

router.route("/:blogId")
    .get(authRateLimiter, getBlogById); // Get blog by ID or slug

router.route("/author/:authorId")
    .get(authRateLimiter, getBlogsByAuthor); // Get blogs by author ID

// Protected routes (require JWT authentication)
router.route("/")
    .post(verifyJwt, authRateLimiter, createBlog); // Create new blog

router.route("/:blogId")
    .patch(verifyJwt, updateBlog) // Update blog
    .delete(verifyJwt, deleteBlog); // Delete blog

router.route("/:blogId/like")
    .post(verifyJwt, toggleLike); // Toggle like on blog

router.route("/:blogId/cover-image")
    .patch(
        verifyJwt,
        upload.single("coverImage"),
        uploadCoverImage
    ); // Upload/update cover image

export default router;