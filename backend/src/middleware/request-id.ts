import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

const HEADER = "x-request-id";
// Only trust well-formed upstream IDs; anything else could inject into logs.
const VALID_ID = /^[\w-]{1,128}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get(HEADER);
  const id = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
  req.id = id;
  res.setHeader(HEADER, id);
  next();
};
