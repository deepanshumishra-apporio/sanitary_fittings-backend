// src/validations/auth.validation.ts
import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
});

export const signinSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const updateMeSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  phone: z.string().min(7).max(20).optional(),
});