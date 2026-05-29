import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import {
  signup,
  login,
  refresh,
  logout,
  getMe,
  updateMe,
  updateUserRole,
  adminUpdateUser,
  getUserDetail,
  adminSetPassword,
  getUsers,
  getAnalytics,
  createSubadmin,
  createCustomer,
} from "../controllers/auth.controller";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: "Too many auth attempts. Please wait 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

router.post("/signup", authLimiter, signup);
router.post("/login", authLimiter, login);
router.post("/refresh", refresh);
router.post("/logout", logout);

router.get("/me", requireAuth, getMe);
router.patch("/me", requireAuth, updateMe);

router.post("/users/subadmin", requireAuth, requireRole("ADMIN"), createSubadmin);
router.post("/users/customer", requireAuth, requireRole("ADMIN", "SUBADMIN"), createCustomer);
router.patch("/users/:id/role", requireAuth, requireRole("ADMIN"), updateUserRole);
router.patch("/users/:id/password", requireAuth, requireRole("ADMIN"), adminSetPassword);
router.get("/users/:id", requireAuth, requireRole("ADMIN", "SUBADMIN"), getUserDetail);
router.patch("/users/:id", requireAuth, requireRole("ADMIN"), adminUpdateUser);
router.get("/users", requireAuth, requireRole("ADMIN", "SUBADMIN"), getUsers);
router.get("/analytics", requireAuth, requireRole("ADMIN", "SUBADMIN"), getAnalytics);

export default router;
