import { z } from "zod";

export const addToCartSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(100),
});

export const updateCartSchema = z.object({
  quantity: z.number().int().min(1).max(100),
});

export type AddToCartDto = z.infer<typeof addToCartSchema>;
export type UpdateCartDto = z.infer<typeof updateCartSchema>;
