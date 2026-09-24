import { pinoHttp } from "pino-http";
import { logger } from "../lib/logger";

export const httpLogger = pinoHttp({
  logger,
  // Reuse the ID set by the requestId middleware so every log line carries it.
  genReqId: (req) => req.id,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  autoLogging: { ignore: (req) => req.url === "/health" },
});
