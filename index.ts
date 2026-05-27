import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import router from "./routes";

// ─── Startup Validation ───────────────────────────────────────────────────────

const REQUIRED_ENV = [
  "FRONTEND_URL",
  "DATABASE_URL",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "JWT_INTERNAL_SECRET",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_URL",
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[Startup] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const port = Number(process.env.PORT || process.env.BACKEND_PORT || 3001);

// ─── App ──────────────────────────────────────────────────────────────────────

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Everything else gets JSON
app.use(express.json({ limit: "10kb" }));

app.use(cookieParser());

app.use("/api/v1", (req, res, next) => {
  const privatePrefixes = [
    "/auth",
    "/order",
    "/cart",
    "/wishlist",
    "/checkout",
    "/address",
  ];

  if (privatePrefixes.some((prefix) => req.path.startsWith(prefix))) {
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("Pragma", "no-cache");
  }

  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/v1", router);

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use(
  (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[UnhandledError]", err);
    res.status(500).json({ error: "Internal server error" });
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(port, () => {
  console.log(`[Server] Running on port ${port}`);
});
