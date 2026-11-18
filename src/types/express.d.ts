import type { User } from "../../generated/prisma/client";

declare global {
  namespace Express {
    interface Request {
      // Set by authMiddleware. Only read it in routes mounted behind authMiddleware.
      user: User;
    }
  }
}
