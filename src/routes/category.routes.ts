import { Router, Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { listCategories } from "../services/order.service";

const categoryRouter = Router();

// GET /categories — every category so far (defaults + ones created automatically)
categoryRouter.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ success: true, data: { categories: await listCategories() } });
  })
);

export default categoryRouter;
