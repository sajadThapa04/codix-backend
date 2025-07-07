import { verifyAdminJwt } from "../middlewares/admin.auth.middlewares.js";
import express from "express";
import {
    createPricing,
    getPricingByServiceId,
    updatePricing,
    deletePricing,
    togglePricingStatus
} from "../controllers/pricing.controller.js";

const router = express.Router();

// Public routes (accessible without authentication)
router.route("/service/:serviceId")
    .get(getPricingByServiceId); // GET /api/v1/pricing/service/:serviceId

// Protected routes (require valid admin access token)
router.use(verifyAdminJwt);

router.route("/")
    .post(createPricing); // POST /api/v1/pricing

router.route("/:pricingId")
    .patch(updatePricing) // PATCH /api/v1/pricing/:pricingId
    .delete(deletePricing); // DELETE /api/v1/pricing/:pricingId

router.route("/:pricingId/toggle-status")
    .patch(togglePricingStatus); // PATCH /api/v1/pricing/:pricingId/toggle-status

export default router;