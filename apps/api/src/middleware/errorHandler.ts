import type { ErrorRequestHandler } from "express";
import { HttpError } from "../util/errors.js";
import { log } from "../logger.js";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    if (err.status === 429 && err.details && typeof err.details === "object") {
      const retryAfter = (err.details as { retryAfter?: number }).retryAfter;
      if (retryAfter) res.setHeader("Retry-After", String(retryAfter));
    }
    res.status(err.status).json({
      error: err.name,
      message: err.message,
      details: err.details,
    });
    return;
  }
  log.error("unhandled_error", {
    path: req.path,
    method: req.method,
    err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
  });
  res.status(500).json({ error: "INTERNAL_ERROR", message: "Something snagged on the server." });
};
