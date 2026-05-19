import { z } from "zod";

export const createOrderSchema = z.object({
  addressId: z.string().min(1).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1),
      })
    )
    .min(1),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"]),
});

export const manualOrderSchema = z
  .object({
    userId: z.uuid().optional(),
    customerName: z.string().trim().min(1).max(100).optional(),
    customerEmail: z.string().trim().toLowerCase().pipe(z.email()).optional(),
    customerPhone: z.string().trim().max(20).optional(),
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
  })
  .refine((d) => d.userId || d.customerEmail, {
    message: "Provide either a user ID or a customer email",
    path: ["customerEmail"],
  });

export type CreateOrderDto = z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusDto = z.infer<typeof updateOrderStatusSchema>;
export type ManualOrderDto = z.infer<typeof manualOrderSchema>;
