import { z } from "zod";

const phone = z
  .string()
  .trim()
  .regex(/^\+?\d{10,15}$/, "phone must be 10–15 digits, optionally starting with +");

const refreshToken = z.string().trim().regex(/^[a-f0-9]{64}$/, "refreshToken is not valid");

export const sendOtpSchema = z.object({ phone });
export const verifyOtpSchema = z.object({ phone, otp: z.string().trim().regex(/^\d{6}$/, "otp must be 6 digits") });
export const refreshSchema = z.object({ refreshToken });
export const logoutSchema = z.object({ refreshToken });
