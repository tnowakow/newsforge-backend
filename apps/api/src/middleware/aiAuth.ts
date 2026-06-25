import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { env } from "../env.js";
import { UnauthorizedError, RateLimitedError } from "../util/errors.js";

const COOKIE_NAME = "aiUnlocked";
const COOKIE_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

/** In-memory soft lockout per IP. Vitaly §3: 3 wrong attempts → 15s lockout. */
const failures = new Map<string, { fails: number; until: number }>();

function ipKey(req: Request): string {
  return req.ip ?? "unknown";
}

export function timingSafeEqualPassword(provided: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(env.AI_UNLOCK_PASSWORD, "utf8");
  if (a.length !== b.length) {
    // Equal-length compare against a dummy buffer so timing leaks length-discrimination only.
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", env.COOKIE_SECRET).update(payload).digest("hex");
}

function makeCookieValue(): string {
  const expiresAt = Date.now() + COOKIE_TTL_MS;
  const payload = `1.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

function verifyCookieValue(raw: string | undefined): boolean {
  if (!raw) return false;
  const parts = raw.split(".");
  if (parts.length !== 3) return false;
  const [v, expStr, sig] = parts as [string, string, string];
  if (v !== "1") return false;
  const expiresAt = Number(expStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = sign(`${v}.${expStr}`);
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function setAiUnlockCookie(res: Response): void {
  res.cookie(COOKIE_NAME, makeCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_TTL_MS,
    path: "/",
  });
}

export function clearAiUnlockCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function recordUnlockAttempt(req: Request, ok: boolean): { lockedUntil?: number } {
  const key = ipKey(req);
  const now = Date.now();
  const entry = failures.get(key);
  if (ok) {
    failures.delete(key);
    return {};
  }
  if (entry && entry.until > now) {
    return { lockedUntil: entry.until };
  }
  const fails = (entry?.fails ?? 0) + 1;
  if (fails >= 3) {
    const until = now + 15_000;
    failures.set(key, { fails, until });
    return { lockedUntil: until };
  }
  failures.set(key, { fails, until: 0 });
  return {};
}

export function assertNotLockedOut(req: Request): void {
  const entry = failures.get(ipKey(req));
  const now = Date.now();
  if (entry && entry.until > now) {
    const retryAfter = Math.ceil((entry.until - now) / 1000);
    throw new RateLimitedError(retryAfter, "Try again in a moment");
  }
}

/** Gate AI-edit endpoints. */
export function requireAiUnlocked(req: Request, _res: Response, next: NextFunction): void {
  if (verifyCookieValue(req.cookies?.[COOKIE_NAME])) {
    next();
    return;
  }
  next(new UnauthorizedError("AI access locked. POST /api/runs/:id/ai-edit/unlock first."));
}
