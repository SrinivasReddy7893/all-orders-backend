import { Request, Response } from "express";
import prisma from "../config/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { fetchOrdersFromGmail } from "../services/gmail.service";
import { upsertOrders, getOrders, getActiveOrders, getMonthlySummary } from "../services/order.service";
import { currentMonth } from "../services/spendSummary";
import { listOrdersQuerySchema, summaryQuerySchema } from "../validations/order.validation";

export const syncOrdersController = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user.id;

  const emails = await fetchOrdersFromGmail(userId);
  await upsertOrders(emails.map((e) => ({ ...e, userId })));

  // Next sync (manual or cron) only needs emails from here on.
  await prisma.connectedEmailAccount.updateMany({
    where: { userId },
    data: { lastSyncedAt: new Date() },
  });

  res.json({ success: true, message: "Orders synced" });
});

// GET /orders?category=GADGETS&status=SHIPPED
export const getOrdersController = asyncHandler(async (req: Request, res: Response) => {
  const filters = listOrdersQuerySchema.parse(req.query);
  const orders = await getOrders(req.user.id, filters);
  res.json({ success: true, data: { orders } });
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
