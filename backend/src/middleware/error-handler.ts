import type { ErrorRequestHandler } from "express";
import { AppError } from "../lib/errors";

type ErrorBody = { error: { code: string; message: string; details?: unknown } };

// Errors thrown by express.json() before our code runs.
function bodyParserError(err: unknown): { status: number; body: ErrorBody } | undefined {
  if (typeof err !== "object" || err === null || !("type" in err)) return undefined;
  if (err.type === "entity.parse.failed") {
    return {
      status: 400,
      body: { error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } },
    };
  }
  if (err.type === "entity.too.large") {
    return {
      status: 413,
      body: { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" } },
    };
  }
  return undefined;
}

// The only place errors become HTTP responses. Registered last in app.ts.
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, next) => {
  // Response already partly sent: let Express close the connection.
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    // Expected client errors: warn with the reason so a rejected request is explainable.
    req.log.warn({ code: err.code }, err.message);
    const body: ErrorBody = { error: { code: err.code, message: err.message } };
    if (err.details !== undefined) body.error.details = err.details;
    res.status(err.statusCode).json(body);
    return;
  }

  const parserError = bodyParserError(err);
  if (parserError) {
    res.status(parserError.status).json(parserError.body);
    return;
  }

  // Unexpected: log everything, reveal nothing.
  req.log.error({ err }, "unhandled error");
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
};
