import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { rateLimiter } from "./middlewares/rateLimiter.middleware";
import { errorHandler } from "./middlewares/error.middleware";
import { notFound } from "./middlewares/notFound.middleware";
import { authMiddleware } from "./middlewares/auth.middleware";
import router from "./routes/index";
import authRouter from "./routes/auth.routes";
import userRouter from "./routes/user.routes";
import orderRouter from "./routes/order.routes";
import categoryRouter from "./routes/category.routes";
import trackingRouter from "./routes/tracking.routes";
import messageRouter from "./routes/message.routes";

const app = express();
const baseRouter = express.Router();

// Security headers on every response.
app.use(helmet());

// CORS: only the configured frontend origins. With none configured in
// development, any origin is allowed so local tools work (production requires a list).
const { CORS_ORIGINS, NODE_ENV } = env();
app.use(cors({ origin: CORS_ORIGINS.length ? CORS_ORIGINS : NODE_ENV !== "production" }));

// 1 MB fits a full POST /messages batch (100 messages).
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
// Express 5 leaves req.body undefined when a request has no body; default it so
// handlers return a clear 400 ("... is required") instead of crashing with a 500.
app.use((req, _res, next) => {
  req.body ??= {};
  next();
});

app.use("/api/v1", rateLimiter, baseRouter);

// Routes
baseRouter.use("/", router);
baseRouter.use("/auth", authRouter);
baseRouter.use("/user", authMiddleware, userRouter);
baseRouter.use("/orders", authMiddleware, orderRouter);
baseRouter.use("/categories", authMiddleware, categoryRouter);
baseRouter.use("/tracking", authMiddleware, trackingRouter);
baseRouter.use("/messages", authMiddleware, messageRouter);

// Global error handlers
app.use(notFound);
app.use(errorHandler);

export default app;
