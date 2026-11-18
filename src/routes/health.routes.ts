import { Router, Request, Response } from "express";
import os from "os";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  const uptime = process.uptime();
  const mem = process.memoryUsage();

  res.status(200).json({
    success: true,
    message: "Server is healthy",
    timestamp: new Date().toISOString(),

    system: {
      uptime: `${Math.floor(uptime / 3600)}h ${Math.floor(
        (uptime % 3600) / 60
      )}m ${Math.floor(uptime % 60)}s`,
      platform: os.platform(),
      nodeVersion: process.version,
      cpuLoad: os.loadavg()[0].toFixed(2),
      memory: {
        rss: `${(mem.rss / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      },
    },
  });
});

export default router;