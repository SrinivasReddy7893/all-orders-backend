import { Router } from "express";
import {
  sendOtpController,
  verifyOtpController,
  refreshTokenController,
  logoutController,
  connectGmailController,
  googleCallbackController,
} from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { authLimiter } from "../middlewares/rateLimiter.middleware";

const authRouter = Router();

// Phone OTP — strict per-IP limit on top of the per-code attempt limit
authRouter.post("/send-otp", authLimiter, sendOtpController);
authRouter.post("/verify-otp", authLimiter, verifyOtpController);

// Gmail connection
authRouter.get("/connect-gmail", authMiddleware, connectGmailController);
authRouter.get("/google/callback", googleCallbackController);

// Session
authRouter.post("/refresh", refreshTokenController);
authRouter.post("/logout", authMiddleware, logoutController);

export default authRouter;
