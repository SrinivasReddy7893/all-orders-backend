import dotenv from 'dotenv'
dotenv.config();
import express from 'express'
import cors from 'cors'
const app = express();


import { rateLimiter } from "./middlewares/rateLimiter.middleware";
import { errorHandler } from "./middlewares/error.middleware";
import { notFound } from "./middlewares/notFound.middleware";
import authRouter from "./routes/auth.routes";
import router from './routes/index';
import userRouter from './routes/user.routes';
import { authMiddleware } from './middlewares/auth.middleware';
import orderRouter from './routes/order.routes';
import categoryRouter from './routes/category.routes';
import trackingRouter from './routes/tracking.routes';
import messageRouter from './routes/message.routes';
const baseRouter = express.Router();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Express 5 leaves req.body undefined when a request has no body; default it so
// handlers return a clear 400 ("... is required") instead of crashing with a 500.
app.use((req, _res, next) => {
  req.body ??= {};
  next();
});
app.use('/api/v1', rateLimiter, baseRouter);

// Routes
baseRouter.use('/', router);
baseRouter.use('/auth' , authRouter);
baseRouter.use('/user', authMiddleware ,userRouter);
baseRouter.use('/orders', authMiddleware, orderRouter);
baseRouter.use('/categories', authMiddleware, categoryRouter);
baseRouter.use('/tracking', authMiddleware, trackingRouter);
baseRouter.use('/messages', authMiddleware, messageRouter);

// Global Error Handlers
app.use(notFound);
app.use(errorHandler);

export default app;