import rateLimit from "express-rate-limit";
import { Request, Response } from "express";

// 🔹 Generic creator
const createLimiter = (
  windowMs: number,
  max: number,
  message: string,
  errorCode: string
) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,

    handler: (_req: Request, res: Response) => {
      const seconds = Math.ceil(windowMs / 1000);

      const retryAfter =
        seconds < 60
          ? `${seconds}s`
          : seconds < 3600
          ? `${Math.ceil(seconds / 60)}min`
          : `${Math.ceil(seconds / 3600)}h`;

      res.status(429).json({
        success: false,
        errorCode,
        message,
        retryAfter,            
        retryAfterSeconds: seconds,
      });
    },
  });

// 🔹 General API limiter
export const rateLimiter = createLimiter(
  15 * 60 * 1000,
  100,
  "Too many requests, please try again later",
  "RATE_LIMITED"
);

// 🔹 Auth limiter (strict): OTP send/verify per IP. In-memory store — fine for one
// server process; use a shared store (e.g. Redis) once more than one instance runs.
export const authLimiter = createLimiter(
  15 * 60 * 1000,
  10,
  "Too many login attempts, please try again later",
  "AUTH_RATE_LIMITED"
);