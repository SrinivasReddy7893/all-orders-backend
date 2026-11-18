import { Request, Response } from "express";
import { sendOtpService, verifyOtpService, refreshTokenService, logoutService } from "../services/auth.service";
import { generateGoogleAuthUrl, connectGmailAccount } from "../services/google.service";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import { logoutSchema, refreshSchema, sendOtpSchema, verifyOtpSchema } from "../validations/auth.validation";

export const sendOtpController = asyncHandler(async (req: Request, res: Response) => {
  const { phone } = sendOtpSchema.parse(req.body);
  const result = await sendOtpService(phone);
  res.status(200).json({ success: true, message: result.message });
});

export const verifyOtpController = asyncHandler(async (req: Request, res: Response) => {
  const { phone, otp } = verifyOtpSchema.parse(req.body);
  const { message, accessToken, refreshToken, user } = await verifyOtpService(phone, otp);
  res.status(200).json({ success: true, message, data: { accessToken, refreshToken, user } });
});

// Returns a new access token AND a new refresh token; the old refresh token stops working.
export const refreshTokenController = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  const tokens = await refreshTokenService(refreshToken);
  res.status(200).json({ success: true, data: tokens });
});

export const connectGmailController = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: { url: generateGoogleAuthUrl(req.user.id) } });
});

export const googleCallbackController = asyncHandler(async (req: Request, res: Response) => {
  const { code, state } = req.query;
  if (typeof code !== "string" || typeof state !== "string") {
    throw new AppError("Google code or state missing", 400, "BAD_REQUEST");
  }
  const { email } = await connectGmailAccount(code, state);
  res.json({ success: true, message: "Gmail connected", data: { email } });
});

export const logoutController = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = logoutSchema.parse(req.body);
  const result = await logoutService(req.user.id, refreshToken);
  res.status(200).json({ success: true, message: result.message });
});
