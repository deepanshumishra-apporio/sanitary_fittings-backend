import { z } from "zod";

export const createSubCategorySchema = z.object({
  categoryId: z.uuid(),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
});

export const updateSubCategorySchema = createSubCategorySchema.partial();

export type CreateSubCategoryDto = z.infer<typeof createSubCategorySchema>;
export type UpdateSubCategoryDto = z.infer<typeof updateSubCategorySchema>;
