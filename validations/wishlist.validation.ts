import { z } from "zod";

export const addToWishlistSchema = z.object({
  productId: z.string().min(1),
});

export type AddToWishlistDto = z.infer<typeof addToWishlistSchema>;
