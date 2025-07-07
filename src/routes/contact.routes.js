import { Router } from "express";
import {
    createContact,
    createAuthenticatedContact, // New controller function
    getAllContacts,
    getContactById,
    updateContact,
    deleteContact,
    getMyContacts
} from "../controllers/contact.controller.js";
import { verifyAdminJwt } from "../middlewares/admin.auth.middlewares.js";
import { authRateLimiter } from "../middlewares/ratelimit.middleware.js";
import { verifyJwt } from "../middlewares/auth.middlewares.js";

const router = Router();

// Public contact creation (no auth required)
router.post("/", authRateLimiter, createContact);

// Authenticated contact creation (requires client auth)
router.post("/auth", authRateLimiter, verifyJwt, createAuthenticatedContact);

// Client protected routes
router.get("/client/me", authRateLimiter, verifyJwt, getMyContacts);

// Admin protected routes
router.use(verifyAdminJwt); // Applies to all routes below

router.get("/", authRateLimiter, getAllContacts);
router.route("/:id")
    .get(authRateLimiter, getContactById)
    .patch(authRateLimiter, updateContact)
    .delete(authRateLimiter, deleteContact)


export default router;