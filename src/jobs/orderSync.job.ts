import cron from "node-cron";
import prisma from "../config/prisma";

import { fetchOrdersFromGmail } from "../services/gmail.service";
import { upsertOrders } from "../services/order.service";

import { logger } from "../utils/logger";

export const startOrderSyncJob = () => {
  cron.schedule("*/15 * * * *", async () => {
    logger.info("Running order sync job...");

    try {
      const connectedAccounts =
        await prisma.connectedEmailAccount.findMany();

      logger.info(
        `Found ${connectedAccounts.length} connected account(s)`
      );

      for (const account of connectedAccounts) {
        // Acquire lock atomically
        const lock =
          await prisma.connectedEmailAccount.updateMany({
            where: {
              id: account.id,
              isSyncing: false,
            },
            data: {
              isSyncing: true,
            },
          });

        if (lock.count === 0) {
          logger.info(
            `Skipping ${account.email} - already syncing`
          );
          continue;
        }

        try {
          logger.info(
            `Syncing orders for ${account.email}`
          );

          const orders =
            await fetchOrdersFromGmail(
              account.userId
            );

          await upsertOrders(
            orders.map((order) => ({
              ...order,
              userId: account.userId,
            }))
          );

          // Update last synced only after successful sync
          await prisma.connectedEmailAccount.update({
            where: {
              id: account.id,
            },
            data: {
              lastSyncedAt: new Date(),
            },
          });

          logger.info(
            `Synced ${orders.length} order(s) for ${account.email}`
          );
        } catch (error) {
          logger.error(
            `Sync failed for ${account.email}`,
            error
          );
        } finally {
          // Release lock
          await prisma.connectedEmailAccount.update({
            where: {
              id: account.id,
            },
            data: {
              isSyncing: false,
            },
          });
        }
      }
    } catch (error) {
      logger.error(
        "Order sync job failed",
        error
      );
    }
  });

  logger.info("Order sync job started");
};