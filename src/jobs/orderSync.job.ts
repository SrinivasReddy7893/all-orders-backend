import cron from "node-cron";
import { logger } from "../utils/logger";
import { syncAllAccounts } from "../services/orderSync.service";

export const startOrderSyncJob = () => {
  cron.schedule("*/15 * * * *", async () => {
    try {
      await syncAllAccounts();
    } catch (error) {
      logger.error("Order sync job failed", error);
    }
  });
  logger.info("Order sync job started");
};
