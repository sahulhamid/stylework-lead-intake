import { z } from "zod";
import { ValidationError } from "./errors";

// Parses untrusted input (body, query, params) against a schema. Returns the typed,
// coerced data or throws a ValidationError listing every invalid field.
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      "Request validation failed",
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  return result.data;
}
