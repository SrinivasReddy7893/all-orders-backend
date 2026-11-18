import { Router, Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ingestMessagesSchema } from "../validations/message.validation";
import { ingestMessages } from "../services/messages/ingestMessages";

const messageRouter = Router();

// POST /messages — order SMS / app notifications captured by the mobile app.
// Safe to retry: messages already processed come back as DUPLICATE.
messageRouter.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const { messages } = ingestMessagesSchema.parse(req.body);
    const results = await ingestMessages(req.user.id, messages);
    const count = (o: string) => results.filter((r) => r.outcome === o).length;
    res.json({
      success: true,
      data: {
        results,
        summary: { attached: count("ATTACHED"), created: count("CREATED"), ignored: count("IGNORED"), duplicate: count("DUPLICATE"), failed: count("FAILED") },
      },
    });
  })
);

export default messageRouter;
