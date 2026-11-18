import { env } from "./config/env";
// Check all settings before anything else starts; exits with a clear message if one is missing.
const config = env();

import app from "./app";
import prisma from "./config/prisma";
import { logger } from "./utils/logger";
import { startOrderSyncJob } from "./jobs/orderSync.job";

const PORT = config.PORT;

const server = app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
  logger.info(`Environment: ${config.NODE_ENV}`);
  startOrderSyncJob();
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

const shutdown = async (signal: string) => {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    await prisma.$disconnect();
    logger.info("Database connection closed");
    process.exit(0);
  });

  // Force exit if close takes too long
  setTimeout(() => {
    logger.error("Graceful shutdown timed out — forcing exit");
    process.exit(1);
  }, 10_000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", err);
  process.exit(1);
});
