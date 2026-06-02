import { z } from "zod";

export const createCompanySchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
});

export const updateCompanySchema = createCompanySchema.partial();

export const upsertCompanyVendorSchema = z.object({
  vendorId: z.uuid(),
  code: z.string().trim().max(100).optional(),
  isActive: z.boolean().optional(),
});

export type CreateCompanyDto = z.infer<typeof createCompanySchema>;
export type UpdateCompanyDto = z.infer<typeof updateCompanySchema>;
export type UpsertCompanyVendorDto = z.infer<typeof upsertCompanyVendorSchema>;
