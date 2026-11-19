import crypto from "crypto";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";
import { MAX_OTP_ATTEMPTS, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS, generateOtp, hashOtp, otpMatches } from "./otp";

const ACCESS_TOKEN_TTL = "15m";
// Rolling: every refresh issues a new token, so 30 days counts from the last app open.
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export const signAccessToken = (userId: string) =>
  jwt.sign({ userId }, env().JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });

/** New session: a short-lived access token + a refresh token (only its hash is stored). */
export const issueTokens = async (userId: string) => {
  const refreshToken = crypto.randomBytes(32).toString("hex");
  await prisma.session.create({
    data: { userId, tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS) },
  });
  return { accessToken: signAccessToken(userId), refreshToken };
};

export const sendOtpService = async (phone: string) => {
  const latest = await prisma.otp.findFirst({ where: { phone }, orderBy: { createdAt: "desc" } });
  if (latest && Date.now() - latest.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    throw new AppError("Please wait before requesting another OTP", 429, "OTP_RATE_LIMIT");
  }

  const otp = generateOtp();
  await prisma.otp.deleteMany({ where: { phone } });
  await prisma.otp.create({
    data: { phone, code: hashOtp(otp), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });

  // No SMS provider yet: the code is only shown in development logs, never in production.
  if (env().NODE_ENV !== "production") logger.info(`OTP for ${phone}: ${otp}`);

  return { message: "OTP sent successfully" };
};

export const verifyOtpService = async (phone: string, otp: string) => {
  const existing = await prisma.otp.findFirst({ where: { phone }, orderBy: { createdAt: "desc" } });
  if (!existing) throw new AppError("Invalid OTP", 400, "INVALID_OTP");

  if (existing.expiresAt < new Date()) {
    await prisma.otp.deleteMany({ where: { phone } });
    throw new AppError("OTP expired", 400, "OTP_EXPIRED");
  }

  if (!otpMatches(otp, existing.code)) {
    // Atomic increment, so parallel guesses can't slip past the limit.
    const { attempts } = await prisma.otp.update({
      where: { id: existing.id },
      data: { attempts: { increment: 1 } },
    });
    if (attempts >= MAX_OTP_ATTEMPTS) {
      await prisma.otp.deleteMany({ where: { phone } });
      throw new AppError("Too many wrong codes. Request a new OTP.", 429, "OTP_ATTEMPTS_EXCEEDED");
    }
    throw new AppError("Invalid OTP", 400, "INVALID_OTP");
  }

  await prisma.otp.deleteMany({ where: { phone } }); // one-time use

  const user = await prisma.user.upsert({
    where: { phone },
    update: { isPhoneVerified: true },
    create: { phone, isPhoneVerified: true },
  });

  return { message: "OTP verified successfully", ...(await issueTokens(user.id)), user };
};

/**
 * Exchange a refresh token for a new access token AND a new refresh token
 * (rotation): the old one stops working, so a stolen token has a short life.
 */
export const refreshTokenService = async (refreshToken: string) => {
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
  if (!session) throw new AppError("Invalid refresh token", 401, "INVALID_TOKEN");

  // Delete first: if two requests race with the same token, only one gets new tokens.
  const { count } = await prisma.session.deleteMany({ where: { id: session.id } });
  if (count === 0) throw new AppError("Invalid refresh token", 401, "INVALID_TOKEN");

  if (session.expiresAt < new Date()) throw new AppError("Refresh token expired", 401, "TOKEN_EXPIRED");

  return issueTokens(session.userId);
};

export const logoutService = async (userId: string, refreshToken: string) => {
  // Scoped to the caller, so one user can't end another user's session.
  await prisma.session.deleteMany({ where: { userId, tokenHash: hashToken(refreshToken) } });
  return { message: "Logged out successfully" };
};
