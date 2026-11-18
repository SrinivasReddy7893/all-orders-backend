import { z } from "zod";

export const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.email().optional(),
  phone: z.string().min(10).optional(),
  avatar: z.string().url().optional(),
});