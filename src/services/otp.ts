import crypto from "crypto";

// Wrong guesses allowed per code before it is destroyed (1-in-a-million each).
export const MAX_OTP_ATTEMPTS = 5;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

/** 6-digit code from a cryptographically secure source (not Math.random). */
export const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

export const hashOtp = (otp: string) => crypto.createHash("sha256").update(otp).digest("hex");

/** Constant-time comparison against the stored hash. */
export const otpMatches = (otp: string, storedHash: string): boolean => {
  const given = Buffer.from(hashOtp(otp), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return given.length === stored.length && crypto.timingSafeEqual(given, stored);
};
