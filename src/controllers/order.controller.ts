import { Request, Response } from "express";
import prisma from "../config/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import { syncAccount } from "../services/orderSync.service";
import { getOrders, getActiveOrders, getMonthlySummary } from "../services/order.service";
import { currentMonth } from "../services/spendSummary";
import { listOrdersQuerySchema, summaryQuerySchema } from "../validations/order.validation";

// POST /orders/sync — sync now instead of waiting for the 15-minute job.
export const syncOrdersController = asyncHandler(async (req: Request, res: Response) => {
  const accounts = await prisma.connectedEmailAccount.findMany({
    where: { userId: req.user.id },
    select: { id: true, userId: true, email: true },
  });
  if (!accounts.length) throw new AppError("No connected Gmail account found", 400, "GMAIL_NOT_CONNECTED");

  const results = await Promise.all(accounts.map(syncAccount));
  if (results.every((r) => r.status === "BUSY")) {
    throw new AppError("A sync is already running. Try again in a moment.", 409, "SYNC_IN_PROGRESS");
  }
  res.json({ success: true, message: "Orders synced", data: { accounts: results } });
});

// GET /orders?category=GADGETS&status=SHIPPED&page=1&pageSize=20
export const getOrdersController = asyncHandler(async (req: Request, res: Response) => {
  const query = listOrdersQuerySchema.parse(req.query);
  res.json({ success: true, data: await getOrders(req.user.id, query) });
});

export const getActiveOrdersController = asyncHandler(async (req: Request, res: Response) => {
  const orders = await getActiveOrders(req.user.id);
  res.json({ success: true, data: { orders } });
});

// GET /orders/summary?month=2026-05 (defaults to the current month, India time)
export const getOrdersSummaryController = asyncHandler(async (req: Request, res: Response) => {
  const { month = currentMonth() } = summaryQuerySchema.parse(req.query);
  const summary = await getMonthlySummary(req.user.id, month);
  res.json({ success: true, data: summary });
});
