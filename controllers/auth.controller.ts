import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../lib/errors";
import * as AuthService from "../services/auth.service";

const signupSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  name: z.string().trim().min(2).max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

const updateRoleSchema = z.object({
  role: z.enum(["CUSTOMER", "SUBADMIN", "DEALER"]),
});

const updateMeSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().max(20).optional(),
});

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: (process.env.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax",
  path: "/api/v1/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000,
} as const;

function setRefreshCookie(res: Response, token: string) {
  res.cookie("refreshToken", token, REFRESH_COOKIE_OPTIONS);
}

function clearRefreshCookie(res: Response) {
  res.clearCookie("refreshToken", { path: "/api/v1/auth" });
  res.clearCookie("refreshToken", { path: "/" });
}

function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: err.issues[0]?.message ?? "Validation error" });
        return;
      }
      console.error("[Auth]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

export const signup = handle(async (req, res) => {
  const { email, password, name } = signupSchema.parse(req.body);
  const result = await AuthService.signup(email, password, name);
  setRefreshCookie(res, result.refreshToken);
  res.status(201).json({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    user: result.user,
  });
});

export const login = handle(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const result = await AuthService.login(email, password);
  setRefreshCookie(res, result.refreshToken);
  res.status(200).json({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    user: result.user,
  });
});

export const refresh = handle(async (req, res) => {
  const token: string | undefined = req.cookies?.refreshToken ?? req.body?.refreshToken;
  if (!token) {
    res.status(400).json({ error: "Refresh token is required" });
    return;
  }
  const result = await AuthService.refreshAuth(token);
  setRefreshCookie(res, result.refreshToken);
  res.status(200).json({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });
});

export const logout = handle(async (req, res) => {
  const token: string | undefined = req.cookies?.refreshToken ?? req.body?.refreshToken;
  if (token) await AuthService.logout(token);
  clearRefreshCookie(res);
  res.status(204).send();
});

export const getMe = handle(async (req, res) => {
  const user = await AuthService.getMe(req.user!.userId);
  res.status(200).json({ user });
});

export const updateMe = handle(async (req, res) => {
  const dto = updateMeSchema.parse(req.body);
  const user = await AuthService.updateMe(req.user!.userId, dto);
  res.json({ user });
});

const createSubadminSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  name: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(30).optional(),
});

const createDealerSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  name: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(30).optional(),
});

const createCustomerSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  name: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(30).optional(),
});

const adminUpdateUserSchema = z.object({
  name: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(30).optional(),
});

const adminSetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const adminUpdateUser = handle(async (req, res) => {
  const dto = adminUpdateUserSchema.parse(req.body);
  const user = await AuthService.adminUpdateUser(req.params.id as string, dto);
  res.json({ success: true, data: user });
});

export const getUserDetail = handle(async (req, res) => {
  const user = await AuthService.getUserDetail(req.params.id as string);
  res.json({ success: true, data: user });
});

export const adminSetPassword = handle(async (req, res) => {
  const { password } = adminSetPasswordSchema.parse(req.body);
  await AuthService.adminSetPassword(req.params.id as string, password);
  res.json({ success: true });
});

export const createSubadmin = handle(async (req, res) => {
  const dto = createSubadminSchema.parse(req.body);
  const user = await AuthService.createSubadmin(dto);
  res.status(201).json({ success: true, data: user });
});

export const createDealer = handle(async (req, res) => {
  const dto = createDealerSchema.parse(req.body);
  const user = await AuthService.createDealer(dto);
  res.status(201).json({ success: true, data: user });
});

export const createCustomer = handle(async (req, res) => {
  const dto = createCustomerSchema.parse(req.body);
  const user = await AuthService.createCustomer(dto);
  res.status(201).json({ success: true, data: user });
});

export const updateUserRole = handle(async (req, res) => {
  const { role } = updateRoleSchema.parse(req.body);
  const user = await AuthService.updateUserRole(req.params.id as string, role, req.user!.userId);
  res.json({ success: true, data: user });
});

const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(["CUSTOMER", "ADMIN", "SUBADMIN", "DEALER"]).optional(),
  search: z.string().trim().optional(),
});

const analyticsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const getUsers = handle(async (req, res) => {
  const { page, limit, role, search } = userListQuerySchema.parse(req.query);
  const result = await AuthService.getUsers(page, limit, role, search);
  res.json({ success: true, ...result });
});

export const getAnalytics = handle(async (req, res) => {
  const { from, to } = analyticsQuerySchema.parse(req.query);
  const data = await AuthService.getAnalytics(from, to);
  res.json({ success: true, data });
});
