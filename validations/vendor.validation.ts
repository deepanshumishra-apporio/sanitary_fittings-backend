import { z } from "zod";

export const createVendorSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().optional(),
  phone: z.string().trim().min(7).max(20).optional(),
  address: z.string().trim().max(300).optional(),
});

export const updateVendorSchema = createVendorSchema.partial();

export const addProductVendorSchema = z.object({
  vendorId: z.uuid(),
  price: z.coerce.number().positive(),
  stock: z.coerce.number().int().min(0),
  sku: z.string().trim().max(100).optional(),
});

export const updateProductVendorSchema = z.object({
  price: z.coerce.number().positive().optional(),
  stock: z.coerce.number().int().min(0).optional(),
  sku: z.string().trim().max(100).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: "At least one field required" });

export type CreateVendorDto = z.infer<typeof createVendorSchema>;
export type UpdateVendorDto = z.infer<typeof updateVendorSchema>;
export type AddProductVendorDto = z.infer<typeof addProductVendorSchema>;
export type UpdateProductVendorDto = z.infer<typeof updateProductVendorSchema>;
