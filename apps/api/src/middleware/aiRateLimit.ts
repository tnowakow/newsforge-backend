import rateLimit from "express-rate-limit";
import { env } from "../env.js";

/**
 * 20 requests/hour per IP on AI endpoints (filler + ai-edit).
 * Backs Vitaly's per-IP token-bucket from architecture §3.
 */
export const aiRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.AI_RATE_LIMIT,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "ai_rate_limit_exceeded" },
});

/**
 * Tight rate limit on POST /api/runs/unlock to make brute-force on the
 * 8-digit demo password impractical. Vitaly's §3 spec: "After 3 wrong
 * attempts from one IP: 15s soft lockout." We use 10 / 15min as a slightly
 * more forgiving variant that still blocks brute force (10^8 search space at
 * 10 tries / 15min = ~285 years).
 *
 * Demo tradeoff: the password itself is intentionally weak (65386538) and
 * publicly documented in the security model. This limiter only prevents an
 * automated drive-by guess from racing through the keyspace.
 */
export const unlockRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "unlock_rate_limit_exceeded" },
  // Don't count successful unlocks against the budget.
  skipSuccessfulRequests: true,
});

/**
 * Approval endpoints (POST /api/runs/:id/approve, /request-changes) are
 * human-driven single actions — no automation should ever burst these.
 * 10 requests per IP per minute is generous for a person clicking Approve
 * on a handful of runs while still crushing scripted bursts (Riley B2:
 * Phase 4 QA blasted 35 approve requests and all returned 200 because no
 * limiter was wired; Sam §11 warn #3 unresolved until this ships).
 */
export const approvalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "approval_rate_limit_exceeded" },
});
