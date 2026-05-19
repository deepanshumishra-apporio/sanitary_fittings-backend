import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import {
  getProductReviews,
  getProductRatingBreakdown,
  getReviewById,
  getMyReviews,
  createOrUpdateReview,
  updateReview,
  deleteMyReview,
  getAllReviews,
  adminDeleteReview,
} from "../controllers/review.controller";

const reviewRoutes = Router();

// ─── Public ───────────────────────────────────────────────────────────────────
reviewRoutes.get("/product/:productId", getProductReviews);
reviewRoutes.get("/product/:productId/breakdown", getProductRatingBreakdown);

// ─── Customer (specific routes before :id to avoid conflicts) ─────────────────
reviewRoutes.get("/my", requireAuth, getMyReviews);
reviewRoutes.post("/product/:productId", requireAuth, createOrUpdateReview);
reviewRoutes.patch("/:id", requireAuth, updateReview);
reviewRoutes.delete("/:id", requireAuth, deleteMyReview);

// ─── Admin ────────────────────────────────────────────────────────────────────
reviewRoutes.get("/", requireAuth, requireRole("ADMIN", "SUBADMIN"), getAllReviews);
reviewRoutes.delete("/admin/:id", requireAuth, requireRole("ADMIN", "SUBADMIN"), adminDeleteReview);

// ─── Public single (last to avoid shadowing named routes) ─────────────────────
reviewRoutes.get("/:id", getReviewById);

export default reviewRoutes;
