import { z } from "zod";

const message = z.object({
  id: z.string().trim().min(1).max(200),
  source: z.enum(["SMS", "NOTIFICATION"]),
  sender: z.string().trim().min(1).max(200),
  title: z.string().max(500).nullable().default(null),
  body: z.string().trim().min(1).max(4000),
  receivedAt: z.iso.datetime({ offset: true }),
});

export const ingestMessagesSchema = z.object({
  messages: z.array(message).min(1).max(100),
});
