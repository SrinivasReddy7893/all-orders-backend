import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

interface JwtPayload {
  userId: string;
}

// Requires "Authorization: Bearer <access token>" and loads the user.
// Tokens and their contents are never logged.
export const authMiddleware = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    }

    const decoded = jwt.verify(authHeader.slice("Bearer ".length), env().JWT_SECRET) as JwtPayload;

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      throw new AppError("User not found", 401, "USER_NOT_FOUND");
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
