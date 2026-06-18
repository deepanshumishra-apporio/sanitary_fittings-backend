import { z } from "zod";

export const createOrderSchema = z.object({
  addressId: z.string().min(1),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1),
      })
    )
    .min(1),
});

// Exact-match customer lookup for the manual-order flow. At least one of email
// / phone must be provided; matching is exact (no partial search) to avoid
// enumeration of the user base.
export const customerLookupSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
    phone: z.string().trim().min(3).max(30).optional(),
  })
  .refine((d) => Boolean(d.email) || Boolean(d.phone), {
    message: "Provide an email or phone number to look up",
  });

export const orderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["PLACED", "CANCELLED"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const analyticsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(["PLACED", "CANCELLED"]),
});

export const updatePaymentStatusSchema = z.object({
  status: z.enum(["UNPAID", "PAID"]),
});

export const manualOrderSchema = z
  .object({
    userId: z.uuid().optional(),
    customerName: z.string().trim().min(1).max(100).optional(),
    customerEmail: z.string().trim().toLowerCase().pipe(z.email()).optional(),
    customerPhone: z.string().trim().max(30).optional(),
    address: z.object({
      name: z.string().trim().min(1, "Recipient name is required"),
      phone: z.string().trim().max(20).optional(),
      line1: z.string().trim().min(1, "Address line 1 is required"),
      line2: z.string().trim().optional(),
      city: z.string().trim().min(1, "City is required"),
      state: z.string().trim().min(1, "State is required"),
      zip: z.string().trim().min(1, "ZIP is required"),
      country: z.string().trim().min(1).default("India"),
    }).optional(),
    items: z
      .array(
        z.object({
          productId: z.uuid(),
          quantity: z.number().int().min(1),
        })
      )
      .min(1, "At least one item is required"),
    paymentStatus: z.enum(["UNPAID", "PAID"]).default("UNPAID"),
  })
  .refine((d) => d.userId || d.customerEmail, {
    message: "Provide either a user ID or a customer email",
    path: ["customerEmail"],
  });

export type CreateOrderDto = z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusDto = z.infer<typeof updateOrderStatusSchema>;
export type UpdatePaymentStatusDto = z.infer<typeof updatePaymentStatusSchema>;
export type ManualOrderDto = z.infer<typeof manualOrderSchema>;
export type CustomerLookupDto = z.infer<typeof customerLookupSchema>;
