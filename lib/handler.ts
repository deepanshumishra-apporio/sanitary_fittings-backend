import type { Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "./errors";

export function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      if (err instanceof ZodError) {
        res.status(400).json({ error: err.issues[0]?.message ?? "Validation error" });
        return;
      }
      console.error("[Handler]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}
