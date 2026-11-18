import { Router, Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { trackingQuerySchema } from "../validations/tracking.validation";
import { trackShipment } from "../services/tracking/tracking.service";

const trackingRouter = Router();

// GET /tracking?q=<order number | tracking number | AWB | consignment ID>
trackingRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const { q } = trackingQuerySchema.parse(req.query);
    res.json({ success: true, data: await trackShipment(req.user.id, q) });
  })
);

export default trackingRouter;
