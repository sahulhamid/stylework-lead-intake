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
  // Log only what's needed to trace a request. Query strings can carry PII
  // (e.g. ?search=<email>) and headers are noisy, so neither is logged.
  serializers: {
    req: (req: { id: unknown; method: string; url: string }) => ({
      id: req.id,
      method: req.method,
      path: req.url.split("?")[0],
    }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
});
