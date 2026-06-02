import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import multer from "multer";
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

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || process.env.BACKEND_PORT || 3001);

// ─── App ──────────────────────────────────────────────────────────────────────

const app = express();

// Render (and most cloud platforms) sit behind a reverse proxy that injects
// X-Forwarded-For. Without this, express-rate-limit throws a ValidationError
// (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR) and crashes the request before any
// response is sent — producing status 0 on the mobile client.
app.set("trust proxy", 1);

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.MOBILE_URL,
  ...(process.env.NODE_ENV !== "production"
    ? ["http://localhost:8081", "http://localhost:19006", "http://localhost:4174"]
    : []),
].filter(Boolean) as string[];

app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Everything else gets JSON
app.use(express.json({ limit: "1mb" }));

app.use(cookieParser());

app.use("/api/v1", (req, res, next) => {
  const privatePrefixes = [
    "/auth",
    "/order",
    "/address",
    "/company",
    "/rate-entry",
    "/subcategory",
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
    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "File is too large (10 MB max per image)"
          : err.code === "LIMIT_UNEXPECTED_FILE"
            ? "Unexpected file field"
            : err.message;
      res.status(400).json({ error: message });
      return;
    }
    if (err.message === "Only image files are allowed") {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error("[UnhandledError]", err);
    res.status(500).json({ error: "Internal server error" });
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────

const server = app.listen(port, host, () => {
  console.log(`[Server] Running on http://${host}:${port}`);
});

server.on("error", (error) => {
  console.error("[Server] Failed to start", error);
  process.exit(1);
});
