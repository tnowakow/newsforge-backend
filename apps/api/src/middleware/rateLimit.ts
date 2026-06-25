import rateLimit from "express-rate-limit";

/** Vitaly §3: per-IP token buckets in memory. Single-instance demo — no Redis. */
export const defaultLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "RATE_LIMITED", scope: "default" },
});

export const writeLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "RATE_LIMITED", scope: "write" },
});

export const aiPerMinuteLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "RATE_LIMITED", scope: "ai-per-minute" },
});

export const aiPerHourLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "RATE_LIMITED", scope: "ai-per-hour" },
});

export const unlockLimiter = rateLimit({
  windowMs: 15_000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "RATE_LIMITED", scope: "unlock" },
});
