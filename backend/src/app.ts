import express, { type Express } from "express";
import helmet from "helmet";
import { httpLogger } from "./middleware/http-logger";
import { requestId } from "./middleware/request-id";

// Builds the app without listening, so tests can drive it with Supertest.
export function createApp(): Express {
  const app = express();

  app.use(requestId);
  app.use(httpLogger);
  app.use(helmet());
  app.use(express.json({ limit: "100kb" }));

  // DB connectivity check is added once Prisma is wired in.
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", uptime: process.uptime() });
  });

  return app;
}
