import express, { type Express } from "express";
import helmet from "helmet";
import { prisma } from "./lib/prisma";
import { errorHandler } from "./middleware/error-handler";
import { httpLogger } from "./middleware/http-logger";
import { notFound } from "./middleware/not-found";
import { requestId } from "./middleware/request-id";
import { leadsRouter } from "./modules/leads/leads.routes";
import { webhookRouter } from "./modules/webhook/webhook.routes";

// Builds the app without listening, so tests can drive it with Supertest.
export function createApp(): Express {
  const app = express();

  app.use(requestId);
  app.use(httpLogger);
  app.use(helmet());
  // Keep the exact request bytes: webhook signatures are computed over the raw body,
  // and re-serializing req.body can change bytes (spacing, key order, unicode escapes).
  app.use(
    express.json({
      limit: "100kb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.get("/health", async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: "ok", db: "up", uptime: process.uptime() });
    } catch (err) {
      req.log.error({ err }, "health check failed: database unreachable");
      res.status(503).json({ status: "error", db: "down", uptime: process.uptime() });
    }
  });

  app.use("/webhook", webhookRouter);
  app.use("/leads", leadsRouter);

  // Must stay last: 404 for unmatched routes, then the central error handler.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
