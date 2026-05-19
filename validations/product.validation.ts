import { z } from "zod";

export const createProductSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).max(100).default(0),
  stock: z.coerce.number().int().min(0).default(0),
  categoryId: z.string().uuid(),
  images: z.preprocess((v) => (typeof v === "string" ? [v] : v), z.array(z.string()).optional()),
  videos: z.preprocess((v) => (typeof v === "string" ? [v] : v), z.array(z.string()).optional()),
});

export const updateProductSchema = createProductSchema
  .omit({ stock: true })
  .partial();

export const productQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  category: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  sortBy: z.enum(["createdAt", "price", "name"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateProductDto = z.infer<typeof createProductSchema>;
export type UpdateProductDto = z.infer<typeof updateProductSchema>;
export type ProductQuery = z.infer<typeof productQuerySchema>;