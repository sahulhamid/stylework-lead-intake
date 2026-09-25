import type { RequestHandler } from "express";
import { NotFoundError } from "../lib/errors";

// Reached only when no route matched. Hands off to the error handler so unknown
// routes get the same JSON error shape as everything else.
export const notFound: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
};
