import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const secret = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} env var not set`);
  return v;
};

export interface AccessTokenPayload {
  sub: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  iat?: number;
  exp?: number;
}

export interface OtpSessionPayload {
  email: string;
  aud: "otp-session";
}

export interface VerificationTokenPayload {
  email: string;
  aud: "email-verified";
}

export const signAccessToken = (userId: string, role: string): string =>
  jwt.sign({ sub: userId, role }, secret("JWT_ACCESS_SECRET"), { expiresIn: "15m" });

export const signRefreshToken = (
  userId: string
): { token: string; jti: string; expiresAt: Date } => {
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  const token = jwt.sign({ sub: userId, jti }, secret("JWT_REFRESH_SECRET"), { expiresIn: "7d" });
  return { token, jti, expiresAt };
};

export const signOtpSessionToken = (email: string): string =>
  jwt.sign({ email, aud: "otp-session" }, secret("JWT_INTERNAL_SECRET"), { expiresIn: "10m" });

export const signVerificationToken = (email: string): string =>
  jwt.sign({ email, aud: "email-verified" }, secret("JWT_INTERNAL_SECRET"), { expiresIn: "15m" });

export const verifyAccessToken = (token: string): AccessTokenPayload =>
  jwt.verify(token, secret("JWT_ACCESS_SECRET")) as AccessTokenPayload;

export const verifyRefreshToken = (token: string): RefreshTokenPayload =>
  jwt.verify(token, secret("JWT_REFRESH_SECRET")) as RefreshTokenPayload;

export const verifyOtpSessionToken = (token: string): OtpSessionPayload => {
  const payload = jwt.verify(token, secret("JWT_INTERNAL_SECRET")) as OtpSessionPayload;
  if (payload.aud !== "otp-session") throw new Error("Invalid token audience");
  return payload;
};

export const verifyVerificationToken = (token: string): VerificationTokenPayload => {
  const payload = jwt.verify(token, secret("JWT_INTERNAL_SECRET")) as VerificationTokenPayload;
  if (payload.aud !== "email-verified") throw new Error("Invalid token audience");
  return payload;
};
