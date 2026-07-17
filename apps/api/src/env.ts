import "dotenv/config";
import { z } from "zod";

// v2 mid-sprint correction (Bob, 23:20 UTC): rename env vars to match
// deployed Railway truth. Legacy names accepted as fallback so existing dev
// .env files continue to boot without edits.
const EnvSchema = z.object({
  DATABASE_URL: z.string().url().or(z.string().min(1)),
  GEMINI_API_KEY: z.string().optional().default(""),
  // Canonical (v2): AI_UNLOCK_PASSWORD. Legacy: AI_EDIT_PASSWORD.
  AI_UNLOCK_PASSWORD: z.string().min(1).optional(),
  AI_EDIT_PASSWORD: z.string().min(1).optional(),
  AI_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  // Canonical (v2): INTERNAL_RENDER_SECRET. Legacy: INTERNAL_RENDER_KEY.
  INTERNAL_RENDER_SECRET: z.string().min(1).optional(),
  INTERNAL_RENDER_KEY: z.string().min(1).optional(),
  PORT: z.coerce.number().int().positive().default(3001),
  UPLOAD_DIR: z.string().default("./storage/uploads"),
  PDF_DIR: z.string().default("./storage/pdfs"),
  // Canonical (v2): APP_BASE_URL. Legacy: PUBLIC_BASE_URL.
  APP_BASE_URL: z.string().optional(),
  PUBLIC_BASE_URL: z.string().default("http://localhost:3001"),
  NODE_ENV: z.string().default("development"),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

// Reconcile canonical / legacy names into a single shape the codebase uses.
const raw = parsed.data;
const unlockPassword = raw.AI_UNLOCK_PASSWORD ?? raw.AI_EDIT_PASSWORD;
if (!unlockPassword) {
  throw new Error(
    "Missing AI_UNLOCK_PASSWORD (or legacy AI_EDIT_PASSWORD) env var",
  );
}
const renderSecret = raw.INTERNAL_RENDER_SECRET ?? raw.INTERNAL_RENDER_KEY;
if (!renderSecret) {
  throw new Error(
    "Missing INTERNAL_RENDER_SECRET (or legacy INTERNAL_RENDER_KEY) env var",
  );
}
const appBaseUrl = raw.APP_BASE_URL ?? raw.PUBLIC_BASE_URL;

export const env = {
  ...raw,
  // Canonical exports — code should use these going forward.
  AI_UNLOCK_PASSWORD: unlockPassword,
  INTERNAL_RENDER_SECRET: renderSecret,
  APP_BASE_URL: appBaseUrl,
  // Legacy aliases retained so v1 call sites keep compiling until each is
  // migrated. Marked — delete in v3.
  AI_EDIT_PASSWORD: unlockPassword,
  INTERNAL_RENDER_KEY: renderSecret,
  PUBLIC_BASE_URL: appBaseUrl,
};
