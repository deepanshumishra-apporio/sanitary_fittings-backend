import { z } from "zod";

export const createAddressSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(7).max(20).optional(),
  line1: z.string().trim().min(5).max(100),
  line2: z.string().trim().max(100).optional(),
  city: z.string().trim().min(2).max(50),
  state: z.string().trim().min(2).max(50),
  zip: z.string().trim().min(3).max(10),
  country: z.string().trim().min(2).max(50),
  isDefault: z.boolean().default(false),
});

export const updateAddressSchema = createAddressSchema.partial();

export type CreateAddressDto = z.infer<typeof createAddressSchema>;
export type UpdateAddressDto = z.infer<typeof updateAddressSchema>;
