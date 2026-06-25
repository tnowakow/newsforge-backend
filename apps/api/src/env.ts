import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  AI_UNLOCK_PASSWORD: z.string().default("65386538"),
  INTERNAL_RENDER_SECRET: z.string().min(8).default("change-me-in-prod"),
  COOKIE_SECRET: z.string().min(8).default("change-me-in-prod"),
  PUPPETEER_EXECUTABLE_PATH: z.string().optional().default(""),
  DATA_DIR: z.string().default("./data"),
});

export const env = EnvSchema.parse(process.env);

export const isProd = env.NODE_ENV === "production";
