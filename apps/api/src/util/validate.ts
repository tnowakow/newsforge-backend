import type { ZodSchema } from "zod";
import { ValidationError } from "./errors.js";

export function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError("Invalid request body", result.error.flatten());
  }
  return result.data;
}

/** Parse opaque Prisma JSON into a typed shape. Vitaly §6.1: never let business logic touch raw JSON. */
export function parseJson<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`JSON shape drift: ${JSON.stringify(result.error.flatten())}`);
  }
  return result.data;
}
