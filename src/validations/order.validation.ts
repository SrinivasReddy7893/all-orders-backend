import { z } from "zod";
import { OrderStatus } from "../../generated/prisma/enums";

export const listOrdersQuerySchema = z.object({
  // Categories are created dynamically, so only the key format is checked here;
  // an unknown key simply matches no orders.
  category: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{1,39}$/, "category must be an UPPER_SNAKE key like GADGETS")
    .optional(),
  status: z.enum(OrderStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const summaryQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must look like 2026-05")
    .optional(),
});
