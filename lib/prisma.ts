import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Proactively retire idle connections after 30 s so pg never hands us a
  // stale socket when a request arrives (Render free-tier Postgres drops idle
  // connections after ~5 min; 30 s stays well ahead of that window).
  idleTimeoutMillis: 30_000,
  // Fail fast if a new connection cannot be established within 5 s.
  connectionTimeoutMillis: 5_000,
  // Free-tier Postgres has a low connection limit; keep the pool small.
  max: 2,
});

// pg-pool emits an "error" event when a connection is terminated while idle.
// Without a listener, Bun/Node treats this as an uncaught exception and crashes
// the process — killing any in-flight request and producing status 0 on mobile.
// The pool already discards the broken client; we just need to suppress the crash.
pool.on("error", (err) => {
  console.error("[pg-pool] idle client error:", err.message);
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export { prisma };
export default prisma;