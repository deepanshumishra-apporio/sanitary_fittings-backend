import { z } from "zod";

export const createRateEntrySchema = z.object({
  productId: z.uuid(),
  vendorId: z.uuid(),
  companyId: z.uuid(),
  rate: z.coerce.number().positive(),
  effectiveDate: z.coerce.date(),
  billNo: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const rateEntryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  categoryId: z.string().trim().optional(),
  subCategoryId: z.string().trim().optional(),
  companyId: z.string().trim().optional(),
  vendorId: z.string().trim().optional(),
  latestOnly: z.coerce.boolean().default(true),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export type CreateRateEntryDto = z.infer<typeof createRateEntrySchema>;
export type RateEntryQueryDto = z.infer<typeof rateEntryQuerySchema>;
