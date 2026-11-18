import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError";

const isDev = process.env.NODE_ENV === "development";

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      errorCode: "VALIDATION_ERROR",
      message: "Validation failed",
      errors: err.issues.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
  }

  // 2. JWT Errors
  if (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    err.name === "JsonWebTokenError"
  ) {
    return res.status(401).json({
      success: false,
      errorCode: "INVALID_TOKEN",
      message: "Invalid token",
    });
  }

  if (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    err.name === "TokenExpiredError"
  ) {
    return res.status(401).json({
      success: false,
      errorCode: "TOKEN_EXPIRED",
      message: "Token expired",
    });
  }

  // 3. Known (Operational) Errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      errorCode: err.errorCode,
      message: err.message,
      ...(isDev && { stack: err.stack }),
    });
  }

  // 4. Unknown Errors (Critical)
  console.error("UNEXPECTED ERROR:", {
    message:
      typeof err === "object" && err !== null && "message" in err
        ? (err as any).message
        : err,
    stack:
      typeof err === "object" && err !== null && "stack" in err
        ? (err as any).stack
        : undefined,
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
  });

  return res.status(500).json({
    success: false,
    errorCode: "INTERNAL_SERVER_ERROR",
    message: "Something went wrong",
    ...(isDev && {
      error: err,
    }),
  });
};