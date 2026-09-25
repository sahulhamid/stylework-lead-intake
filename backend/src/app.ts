import express, { type Express } from "express";
import helmet from "helmet";
import { prisma } from "./lib/prisma";
import { httpLogger } from "./middleware/http-logger";
import { requestId } from "./middleware/request-id";

// Builds the app without listening, so tests can drive it with Supertest.
export function createApp(): Express {
  const app = express();

  app.use(requestId);
  app.use(httpLogger);
  app.use(helmet());
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: "ok", db: "up", uptime: process.uptime() });
    } catch (err) {
      req.log.error({ err }, "health check failed: database unreachable");
      res.status(503).json({ status: "error", db: "down", uptime: process.uptime() });
    }
  });

  return app;
}
