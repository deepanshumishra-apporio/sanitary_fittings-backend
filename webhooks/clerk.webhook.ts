import { Webhook } from "svix";
import type { Request, Response } from "express";
import prisma from "../lib/prisma";

type ClerkUserEvent = {
  type: "user.created" | "user.updated" | "user.deleted";
  data: {
    id: string;
    email_addresses: Array<{ email_address: string; id: string }>;
    phone_numbers: Array<{ phone_number: string; id: string }>;
    first_name: string | null;
    last_name: string | null;
    deleted?: boolean;
  };
};

export const handleClerkWebhook = async (req: Request, res: Response): Promise<void> => {
  const svixId = req.headers["svix-id"] as string;
  const svixTimestamp = req.headers["svix-timestamp"] as string;
  const svixSignature = req.headers["svix-signature"] as string;

  if (!svixId || !svixTimestamp || !svixSignature) {
    res.status(400).json({ error: "Missing svix headers" });
    return;
  }

  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    res.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  const wh = new Webhook(webhookSecret);
  let event: ClerkUserEvent;

  try {
    event = wh.verify(req.body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkUserEvent;
  } catch {
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }

  const { type, data } = event;

  try {
    switch (type) {
      case "user.created": {
        const email = data.email_addresses[0]?.email_address ?? null;
        const phone = data.phone_numbers[0]?.phone_number ?? null;
        const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || null;

        await prisma.user.create({
          data: { clerkId: data.id, email, phone, name },
        });
        break;
      }

      case "user.updated": {
        const email = data.email_addresses[0]?.email_address ?? null;
        const phone = data.phone_numbers[0]?.phone_number ?? null;
        const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || null;

        await prisma.user.upsert({
          where: { clerkId: data.id },
          update: { email, phone, name },
          create: { clerkId: data.id, email, phone, name },
        });
        break;
      }

      case "user.deleted": {
        try {
          await prisma.user.delete({ where: { clerkId: data.id } });
        } catch (err: unknown) {
          // P2025 = record not found — already deleted, treat as success
          if ((err as { code?: string })?.code !== "P2025") throw err;
        }
        break;
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("[ClerkWebhook] DB error:", error);
    res.status(500).json({ error: "Database error" });
  }
};
