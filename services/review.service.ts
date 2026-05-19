import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import type {
  CreateReviewDto,
  UpdateReviewDto,
  ReviewQuery,
  AdminReviewQuery,
} from "../validations/review.validation";

// ─── Selects ─────────────────────────────────────────────────────────────────

const reviewSelect = {
  id: true,
  rating: true,
  comment: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true } },
  product: { select: { id: true, name: true, images: true } },
};

// ─── Public ───────────────────────────────────────────────────────────────────

export async function getProductReviews(productId: string, query: ReviewQuery) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) throw new AppError(404, "Product not found");

  const { page, limit, rating, sortBy, order } = query;
  const skip = (page - 1) * limit;
  const where = { productId, ...(rating && { rating }) };

  const [reviews, total, aggregate] = await Promise.all([
    prisma.review.findMany({
      where,
      select: reviewSelect,
      orderBy: { [sortBy]: order },
      skip,
      take: limit,
    }),
    prisma.review.count({ where }),
    prisma.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { rating: true },
    }),
  ]);

  return {
    data: reviews,
    stats: {
      averageRating: aggregate._avg.rating ? +aggregate._avg.rating.toFixed(1) : 0,
      totalReviews: aggregate._count.rating,
    },
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  };
}

export async function getReviewById(reviewId: string) {
  const review = await prisma.review.findUnique({ where: { id: reviewId }, select: reviewSelect });
  if (!review) throw new AppError(404, "Review not found");
  return review;
}

// ─── Customer ─────────────────────────────────────────────────────────────────

export async function getMyReviews(userId: string, query: ReviewQuery) {
  const { page, limit, rating, sortBy, order } = query;
  const skip = (page - 1) * limit;
  const where = { userId, ...(rating && { rating }) };

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      select: reviewSelect,
      orderBy: { [sortBy]: order },
      skip,
      take: limit,
    }),
    prisma.review.count({ where }),
  ]);

  return { data: reviews, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
}

export async function createOrUpdateReview(productId: string, userId: string, dto: CreateReviewDto) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) throw new AppError(404, "Product not found");

  return prisma.review.upsert({
    where: { userId_productId: { userId, productId } },
    create: { ...dto, userId, productId },
    update: dto,
    select: reviewSelect,
  });
}

export async function updateReview(reviewId: string, userId: string, dto: UpdateReviewDto) {
  const review = await prisma.review.findUnique({ where: { id: reviewId }, select: { userId: true } });
  if (!review) throw new AppError(404, "Review not found");
  if (review.userId !== userId) throw new AppError(403, "You can only edit your own reviews");

  return prisma.review.update({ where: { id: reviewId }, data: dto, select: reviewSelect });
}

export async function deleteMyReview(reviewId: string, userId: string) {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { userId: true },
  });
  if (!review) throw new AppError(404, "Review not found");
  if (review.userId !== userId) throw new AppError(403, "You can only delete your own reviews");
  await prisma.review.delete({ where: { id: reviewId } });
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function getAllReviews(query: AdminReviewQuery) {
  const { page, limit, rating, sortBy, order, productId, userId } = query;
  const skip = (page - 1) * limit;
  const where = {
    ...(rating && { rating }),
    ...(productId && { productId }),
    ...(userId && { userId }),
  };

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      select: reviewSelect,
      orderBy: { [sortBy]: order },
      skip,
      take: limit,
    }),
    prisma.review.count({ where }),
  ]);

  return { data: reviews, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
}

export async function adminDeleteReview(reviewId: string) {
  const review = await prisma.review.findUnique({ where: { id: reviewId }, select: { id: true } });
  if (!review) throw new AppError(404, "Review not found");
  await prisma.review.delete({ where: { id: reviewId } });
}

export async function getProductRatingBreakdown(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) throw new AppError(404, "Product not found");

  const breakdown = await prisma.review.groupBy({
    by: ["rating"],
    where: { productId },
    _count: { rating: true },
    orderBy: { rating: "desc" },
  });

  // Ensure all 5 rating slots are present
  const full = [5, 4, 3, 2, 1].map((star) => ({
    rating: star,
    count: breakdown.find((b) => b.rating === star)?._count.rating ?? 0,
  }));

  return full;
}
