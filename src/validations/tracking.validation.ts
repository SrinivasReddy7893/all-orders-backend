import { z } from "zod";

export const trackingQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(3, "Enter an order number or tracking number")
    .max(64, "That is too long to be an order or tracking number")
    .regex(/^[A-Za-z0-9#&\-\s]+$/, "Use only letters, numbers, #, & and -"),
});
