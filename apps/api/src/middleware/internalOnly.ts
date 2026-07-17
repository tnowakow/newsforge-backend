import type { Request, Response, NextFunction } from "express";
import { env } from "../env.js";

/**
 * Locks the /render/:runId route to local Puppeteer only:
 *   - request must come from 127.0.0.1 or ::1
 *   - query.key must equal INTERNAL_RENDER_KEY
 * Everything else -> 403.
 */
export function internalOnly(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || "";
  const localOk =
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1";
  const keyOk = req.query.key === env.INTERNAL_RENDER_KEY;
  if (!localOk || !keyOk) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
}
