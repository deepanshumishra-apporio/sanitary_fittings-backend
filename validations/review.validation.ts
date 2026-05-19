import { z } from "zod";

export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(1000).optional(),
});

export const updateReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5).optional(),
    comment: z.string().trim().max(1000).optional(),
  })
  .refine((d) => d.rating !== undefined || d.comment !== undefined, {
    message: "Provide at least one field to update",
  });

export const reviewQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  sortBy: z.enum(["rating", "createdAt"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const adminReviewQuerySchema = reviewQuerySchema.extend({
  productId: z.string().optional(),
  userId: z.string().optional(),
});

export type CreateReviewDto = z.infer<typeof createReviewSchema>;
export type UpdateReviewDto = z.infer<typeof updateReviewSchema>;
export type ReviewQuery = z.infer<typeof reviewQuerySchema>;
export type AdminReviewQuery = z.infer<typeof adminReviewQuerySchema>;
