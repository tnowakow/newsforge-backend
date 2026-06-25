import type { Request, Response, NextFunction } from "express";
import { env } from "../env.js";

/**
 * Vitaly §6.7: internal /render/:id route locked to 127.0.0.1 AND requires a secret header.
 * Loopback addresses include IPv6-mapped IPv4 (::ffff:127.0.0.1) and ::1.
 */
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function localOnlyWithSecret(req: Request, _res: Response, next: NextFunction): void {
  const ip = req.ip ?? "";
  const ok = LOOPBACK.has(ip) || LOOPBACK.has(ip.replace(/^::ffff:/, ""));
  const header = req.header("x-internal-render-secret");
  if (!ok || header !== env.INTERNAL_RENDER_SECRET) {
    _res.status(403).json({ error: "FORBIDDEN", message: "Internal route." });
    return;
  }
  next();
}
