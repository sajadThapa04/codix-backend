import Router from "express";
import {
    registerClient,
    loginClient,
    logoutClient,
    refreshClientAccessToken,
    getCurrentClient,
    updateClientDetails,
    updateClientAddress,
    changeClientPassword,
    requestClientPasswordReset,
    resetClientPassword,
    uploadClientProfileImage,
    verifyClientEmail
} from "../controllers/client.controller.js";
import { upload } from "../middlewares/multler.middlewares.js";
import { verifyJwt } from "../middlewares/auth.middlewares.js";
import { authRateLimiter, strictAuthRateLimiter } from "../middlewares/ratelimit.middleware.js";
const router = Router();

// Public routes
router.route("/register")
    .post(authRateLimiter, registerClient); // Register a new client

router.route("/login")
    .post(authRateLimiter, loginClient); // Login client

router.route("/verify-email")
    .get(authRateLimiter, verifyClientEmail); // Verify email (GET /verify-email?token=...)

router.route("/request-password-reset")
    .post(strictAuthRateLimiter, requestClientPasswordReset); // Request password reset

router.route("/reset-password")
    .post(strictAuthRateLimiter, resetClientPassword); // Reset password

// Protected routes (require JWT authentication)
router.route("/logout")
    .post(verifyJwt, logoutClient); // Logout client

router.route("/refresh-token")
    .post(authRateLimiter, refreshClientAccessToken); // Refresh access token

// Client profile routes
router.route("/me")
    .get(verifyJwt, getCurrentClient); // Get current client

router.route("/update-details")
    .patch(verifyJwt, updateClientDetails); // Update client details

router.route("/update-address")
    .patch(verifyJwt, updateClientAddress); // Update client address

router.route("/change-password")
    .post(verifyJwt, changeClientPassword); // Change password

router.route("/upload-profile-image")
    .patch(
        verifyJwt,
        upload.single("profileImage"),
        uploadClientProfileImage
    ); // Upload profile image

export default router;