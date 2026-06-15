import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../lib/jwt";

export type AuthResult = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    role: string;
  };
};

function normalize(email: string) {
  return email.trim().toLowerCase();
}

async function issueTokens(userId: string, role: string): Promise<AuthResult> {
  const { token: refreshToken, jti, expiresAt } = signRefreshToken(userId);
  const accessToken = signAccessToken(userId, role);

  await prisma.refreshToken.create({ data: { jti, userId, expiresAt } });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  });

  return { accessToken, refreshToken, expiresAt, user };
}

export async function signup(rawEmail: string, password: string, name?: string): Promise<AuthResult> {
  const email = normalize(rawEmail);

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) throw new AppError(409, "An account with this email already exists");

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name: name?.trim() || null,
      role: "CUSTOMER",
      emailVerified: true,
    },
    select: { id: true, role: true },
  });

  return issueTokens(user.id, user.role);
}

export async function login(rawEmail: string, password: string): Promise<AuthResult> {
  const email = normalize(rawEmail);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, password: true },
  });

  const hash = user?.password ?? "$2b$12$invalidhashpadding00000000000000000000000000000000000";
  const valid = await bcrypt.compare(password, hash);

  if (!user || !valid) {
    throw new AppError(401, "Invalid email or password");
  }

  return issueTokens(user.id, user.role);
}

export async function refreshAuth(incomingToken: string): Promise<AuthResult> {
  let payload;
  try {
    payload = verifyRefreshToken(incomingToken);
  } catch {
    throw new AppError(401, "Invalid or expired refresh token");
  }

  // Atomically claim (delete) the token. deleteMany acts as the lock: only one
  // concurrent caller can match-and-delete a given jti, so racing refreshes
  // (common when several 401s fire at once on a mobile client) can't both
  // rotate, and a benign race no longer wipes every session — the loser simply
  // gets a 401 for that one request instead of being logged out everywhere.
  const claimed = await prisma.refreshToken.deleteMany({
    where: { jti: payload.jti, userId: payload.sub, expiresAt: { gt: new Date() } },
  });

  if (claimed.count === 0) {
    throw new AppError(401, "Invalid or expired refresh token. Please sign in again.");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true },
  });
  if (!user) throw new AppError(401, "User no longer exists");

  return issueTokens(user.id, user.role);
}

export async function logout(incomingToken: string): Promise<void> {
  try {
    const payload = verifyRefreshToken(incomingToken);
    await prisma.refreshToken.deleteMany({ where: { jti: payload.jti } });
  } catch {
    // Logout is always successful from the client's perspective
  }
}

export async function adminUpdateUser(
  targetUserId: string,
  dto: { name?: string; phone?: string }
) {
  const user = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
  if (!user) throw new AppError(404, "User not found");

  return prisma.user.update({
    where: { id: targetUserId },
    data: {
      ...(dto.name !== undefined && { name: dto.name || null }),
      ...(dto.phone !== undefined && { phone: dto.phone || null }),
    },
    select: { id: true, email: true, name: true, phone: true, role: true, createdAt: true },
  });
}

export async function getUserDetail(targetUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      emailVerified: true,
      createdAt: true,
      orders: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          totalPrice: true,
          discount: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          address: {
            select: {
              id: true,
              userId: true,
              name: true,
              phone: true,
              line1: true,
              line2: true,
              city: true,
              state: true,
              zip: true,
              country: true,
              isDefault: true,
            },
          },
          payment: {
            select: {
              id: true,
              amount: true,
              status: true,
            },
          },
          dealer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          items: {
            select: {
              id: true,
              orderId: true,
              productId: true,
              quantity: true,
              price: true,
              discount: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  price: true,
                  discount: true,
                  images: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) throw new AppError(404, "User not found");
  return user;
}

export async function adminSetPassword(targetUserId: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
  if (!user) throw new AppError(404, "User not found");
  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: targetUserId }, data: { password: hashed } });
}

export async function updateUserRole(
  targetUserId: string,
  newRole: "CUSTOMER" | "SUBADMIN" | "DEALER",
  requestingUserId: string
) {
  if (targetUserId === requestingUserId) {
    throw new AppError(400, "You cannot change your own role");
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, role: true, email: true, name: true },
  });
  if (!target) throw new AppError(404, "User not found");

  if (target.role === "ADMIN") {
    throw new AppError(403, "Cannot change the role of another admin");
  }

  return prisma.user.update({
    where: { id: targetUserId },
    data: { role: newRole },
    select: { id: true, email: true, name: true, role: true },
  });
}

export async function createSubadmin(dto: {
  email: string;
  password: string;
  name?: string;
  phone?: string;
}) {
  const email = normalize(dto.email);
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new AppError(409, "An account with this email already exists");

  const passwordHash = await bcrypt.hash(dto.password, 12);

  return prisma.user.create({
    data: {
      email,
      password: passwordHash,
      name: dto.name ?? null,
      phone: dto.phone ?? null,
      role: "SUBADMIN",
      emailVerified: true,
    },
    select: { id: true, email: true, name: true, phone: true, role: true, createdAt: true },
  });
}

export async function createDealer(dto: {
  email: string;
  password: string;
  name?: string;
  phone?: string;
}) {
  const email = normalize(dto.email);
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new AppError(409, "An account with this email already exists");

  const passwordHash = await bcrypt.hash(dto.password, 12);

  return prisma.user.create({
    data: {
      email,
      password: passwordHash,
      name: dto.name ?? null,
      phone: dto.phone ?? null,
      role: "DEALER",
      emailVerified: true,
    },
    select: { id: true, email: true, name: true, phone: true, role: true, createdAt: true },
  });
}

export async function createCustomer(dto: {
  email: string;
  name?: string;
  phone?: string;
}) {
  const email = normalize(dto.email);
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new AppError(409, "An account with this email already exists");

  return prisma.user.create({
    data: {
      email,
      name: dto.name ?? null,
      phone: dto.phone ?? null,
      role: "CUSTOMER",
      emailVerified: true,
    },
    select: { id: true, email: true, name: true, phone: true, role: true, createdAt: true },
  });
}

export async function getUsers(
  page: number,
  limit: number,
  role?: string,
  search?: string
) {
  const skip = (page - 1) * limit;
  const where = {
    ...(role && { role: role as "CUSTOMER" | "ADMIN" | "SUBADMIN" | "DEALER" }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { email: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        emailVerified: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);
  return { data: users, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
}

export async function getAnalytics(from?: Date, to?: Date) {
  const placedStatus = "PLACED";
  const cancelledStatus = "CANCELLED";

  const dateWhere = from || to
    ? { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }
    : {};

  const [
    totalOrders,
    totalCustomers,
    totalProducts,
    revenue,
    deliveredRevenue,
    activeOrderValue,
    cancelledOrderValue,
    activeOrders,
    completedOrders,
    cancelledOrders,
    ordersByStatus,
    recentOrders,
    chartOrders,
  ] = await Promise.all([
    prisma.order.count({ where: { ...dateWhere } }),
    prisma.user.count({ where: { role: "CUSTOMER" } }),
    prisma.product.count(),
    prisma.order.aggregate({
      _sum: { totalPrice: true },
      _avg: { totalPrice: true },
      where: { status: placedStatus, ...dateWhere },
    }),
    prisma.order.aggregate({
      _sum: { totalPrice: true },
      where: { status: placedStatus, ...dateWhere },
    }),
    prisma.order.aggregate({
      _sum: { totalPrice: true },
      where: { status: placedStatus, ...dateWhere },
    }),
    prisma.order.aggregate({
      _sum: { totalPrice: true },
      where: { status: cancelledStatus, ...dateWhere },
    }),
    prisma.order.count({ where: { status: placedStatus, ...dateWhere } }),
    prisma.order.count({ where: { status: placedStatus, ...dateWhere } }),
    prisma.order.count({ where: { status: cancelledStatus, ...dateWhere } }),
    prisma.order.groupBy({ by: ["status"], _count: { status: true }, where: { ...dateWhere } }),
    prisma.order.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      where: { ...dateWhere },
      select: {
        id: true,
        totalPrice: true,
        status: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
        dealer: { select: { name: true, email: true } },
      },
    }),
    prisma.order.findMany({
      where: {
        status: placedStatus,
        createdAt: {
          gte: from ?? new Date(Date.now() - 29 * 24 * 60 * 60 * 1000),
          lte: to ?? new Date(),
        },
      },
      select: { createdAt: true, totalPrice: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const dayMap: Record<string, { date: string; revenue: number; orders: number }> = {};
  for (const o of chartOrders) {
    const day = o.createdAt.toISOString().slice(0, 10);
    if (!dayMap[day]) dayMap[day] = { date: day, revenue: 0, orders: 0 };
    dayMap[day].revenue += o.totalPrice;
    dayMap[day].orders += 1;
  }
  const dailyData = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalOrders,
    totalRevenue: revenue._sum?.totalPrice ?? 0,
    grossRevenue: revenue._sum?.totalPrice ?? 0,
    deliveredRevenue: deliveredRevenue._sum?.totalPrice ?? 0,
    activeOrderValue: activeOrderValue._sum?.totalPrice ?? 0,
    cancelledOrderValue: cancelledOrderValue._sum?.totalPrice ?? 0,
    averageOrderValue: revenue._avg?.totalPrice ?? 0,
    activeOrders,
    completedOrders,
    cancelledOrders,
    totalCustomers,
    totalProducts,
    ordersByStatus: Object.fromEntries(
      ordersByStatus.map((o) => [o.status, o._count.status])
    ),
    recentOrders,
    dailyData,
  };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      emailVerified: true,
      createdAt: true,
    },
  });
  if (!user) throw new AppError(404, "User not found");
  return user;
}

export async function updateMe(userId: string, dto: { name?: string; phone?: string }) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
    },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      emailVerified: true,
      createdAt: true,
    },
  });
}
