import { z } from "zod";

export const createVendorStockBillSchema = z.object({
  vendorId: z.uuid(),
  companyId: z.uuid().optional(),
  billNo: z.string().trim().min(1).max(100),
  billDate: z.coerce.date(),
  billAmount: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(500).optional(),
  entries: z
    .array(
      z.object({
        productId: z.uuid(),
        quantity: z.coerce.number().int().positive(),
        rate: z.coerce.number().positive(),
        notes: z.string().trim().max(500).optional(),
      })
    )
    .min(1, "At least one stock entry is required"),
});

export const vendorStockBillQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  vendorId: z.uuid().optional(),
  companyId: z.uuid().optional(),
  productId: z.uuid().optional(),
  billNo: z.string().trim().optional(),
});

export const vendorStockHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  productId: z.uuid().optional(),
  vendorId: z.uuid().optional(),
});

export type CreateVendorStockBillDto = z.infer<typeof createVendorStockBillSchema>;
export type VendorStockBillQueryDto = z.infer<typeof vendorStockBillQuerySchema>;
export type VendorStockHistoryQueryDto = z.infer<typeof vendorStockHistoryQuerySchema>;
