import { z } from "zod";

export const createVendorSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().email(),
  phone: z.string().trim().min(7).max(20).optional(),
  address: z.string().trim().max(300).optional(),
});

export const updateVendorSchema = createVendorSchema.partial();

export const addProductVendorSchema = z.object({
  vendorId: z.string().min(1),
  price: z.number().positive(),
  stock: z.number().int().min(0),
  sku: z.string().trim().max(100).optional(),
});

export const updateProductVendorSchema = z.object({
  price: z.number().positive().optional(),
  stock: z.number().int().min(0).optional(),
  sku: z.string().trim().max(100).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: "At least one field required" });

export type CreateVendorDto = z.infer<typeof createVendorSchema>;
export type UpdateVendorDto = z.infer<typeof updateVendorSchema>;
export type AddProductVendorDto = z.infer<typeof addProductVendorSchema>;
export type UpdateProductVendorDto = z.infer<typeof updateProductVendorSchema>;
