export class AppError extends Error {
  statusCode: number;
  errorCode: string;
  isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    errorCode: string,
    isOperational = true
  ) {
    super(message);

    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Predefined error creators
export const Errors = {
  NotFound: (resource = "Resource") =>
    new AppError(`${resource} not found`, 404, "NOT_FOUND"),

  Unauthorized: () =>
    new AppError("Unauthorized", 401, "UNAUTHORIZED"),

  Forbidden: () =>
    new AppError("Forbidden", 403, "FORBIDDEN"),

  BadRequest: (msg: string) =>
    new AppError(msg, 400, "BAD_REQUEST"),

  Conflict: (msg: string) =>
    new AppError(msg, 409, "CONFLICT"),

  TooManyRequests: () =>
    new AppError("Too many requests", 429, "RATE_LIMITED"),

  Internal: () =>
    new AppError("Internal server error", 500, "INTERNAL_ERROR", false),
};