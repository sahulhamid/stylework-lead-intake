import { pino } from "pino";
import { env } from "../config/env";

export const logger = pino({
  level: env.LOG_LEVEL,
  // Secrets and lead PII must never reach log storage.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'req.headers["x-hub-signature-256"]',
      "*.email",
      "*.phone",
      "*.fullName",
      "*.full_name",
    ],
    censor: "[REDACTED]",
  },
  ...(env.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: { singleLine: true, translateTime: "SYS:HH:MM:ss" },
        },
      }
    : {}),
});
