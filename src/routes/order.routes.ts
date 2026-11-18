import { Router } from "express";
import {
  syncOrdersController,
  getOrdersController,
  getActiveOrdersController,
  getOrdersSummaryController,
} from "../controllers/order.controller";

const orderRouter = Router();

orderRouter.post("/sync", syncOrdersController);
orderRouter.get("/", getOrdersController);
orderRouter.get("/active", getActiveOrdersController);
orderRouter.get("/summary", getOrdersSummaryController);

export default orderRouter;
