import type { Request, Response } from "express";
import crypto from "node:crypto";
import { env } from "../env.js";

/**
 * Constant-time password comparison. Pads the attempt to match secret length
 * to avoid leaking length via timingSafeEqual's required-equal-length contract.
 */
export function checkAiPassword(attempt: string): boolean {
  const secret = Buffer.from(env.AI_EDIT_PASSWORD, "utf8");
  const a = Buffer.alloc(secret.length);
  Buffer.from(attempt ?? "", "utf8").copy(a, 0, 0, secret.length);
  let ok = false;
  try {
    ok = crypto.timingSafeEqual(a, secret);
  } catch {
    ok = false;
  }
  return ok && (attempt?.length ?? 0) === secret.length;
}

export const AI_UNLOCK_COOKIE = "aiUnlocked";

export function setAiUnlockedCookie(res: Response) {
  res.cookie(AI_UNLOCK_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8, // 8h
    path: "/",
  });
}

export function hasAiUnlockCookie(req: Request): boolean {
  return req.cookies?.[AI_UNLOCK_COOKIE] === "1";
}
