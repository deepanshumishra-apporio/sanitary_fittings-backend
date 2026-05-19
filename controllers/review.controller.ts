import { handle } from "../lib/handler";
import {
  createReviewSchema,
  updateReviewSchema,
  reviewQuerySchema,
  adminReviewQuerySchema,
} from "../validations/review.validation";
import * as reviewService from "../services/review.service";

// ─── Public ───────────────────────────────────────────────────────────────────

export const getProductReviews = handle(async (req, res) => {
  const query = reviewQuerySchema.parse(req.query);
  const result = await reviewService.getProductReviews(req.params.productId as string, query);
  res.json({ success: true, ...result });
});

export const getProductRatingBreakdown = handle(async (req, res) => {
  const breakdown = await reviewService.getProductRatingBreakdown(req.params.productId as string);
  res.json({ success: true, data: breakdown });
});

export const getReviewById = handle(async (req, res) => {
  const review = await reviewService.getReviewById(req.params.id as string);
  res.json({ success: true, data: review });
});

// ─── Customer ─────────────────────────────────────────────────────────────────

export const getMyReviews = handle(async (req, res) => {
  const query = reviewQuerySchema.parse(req.query);
  const result = await reviewService.getMyReviews(req.user!.userId, query);
  res.json({ success: true, ...result });
});

export const createOrUpdateReview = handle(async (req, res) => {
  const dto = createReviewSchema.parse(req.body);
  const review = await reviewService.createOrUpdateReview(
    req.params.productId as string,
    req.user!.userId,
    dto
  );
  res.status(201).json({ success: true, data: review });
});

export const updateReview = handle(async (req, res) => {
  const dto = updateReviewSchema.parse(req.body);
  const review = await reviewService.updateReview(req.params.id as string, req.user!.userId, dto);
  res.json({ success: true, data: review });
});

export const deleteMyReview = handle(async (req, res) => {
  await reviewService.deleteMyReview(req.params.id as string, req.user!.userId);
  res.json({ success: true, message: "Review deleted" });
});

// ─── Admin ────────────────────────────────────────────────────────────────────

export const getAllReviews = handle(async (req, res) => {
  const query = adminReviewQuerySchema.parse(req.query);
  const result = await reviewService.getAllReviews(query);
  res.json({ success: true, ...result });
});

export const adminDeleteReview = handle(async (req, res) => {
  await reviewService.adminDeleteReview(req.params.id as string);
  res.json({ success: true, message: "Review deleted" });
});
