/**
 * TRI-R05 — describe actual image pixels via a configured vision provider.
 *
 * Cache key: sha256(bytes) + model + promptVersion.
 * Never identifies people or infers medical status.
 * When no provider is configured, returns analysisStatus "unavailable"
 * without inventing content from filenames or captions.
 *
 * Reads process.env directly (not env.ts) so unit tests can import this
 * module without booting the full API environment.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import {
  ImageContentAnalysisSchema,
  type ImageContentAnalysis,
  type NewsImage,
} from "@newsforge/shared/schemas";

export const IMAGE_DESCRIPTION_PROMPT_VERSION = "trilogy-r05-v1";
export const GEMINI_VISION_MODEL = "gemini-2.5-flash";

const VisionPayloadSchema = z.object({
  scene: z.string().min(1),
  objects: z.array(z.string()).default([]),
  orientation: z.enum(["landscape", "portrait", "square"]).optional(),
  subjectBounds: z
    .object({
      left: z.number().min(0).max(100),
      top: z.number().min(0).max(100),
      right: z.number().min(0).max(100),
      bottom: z.number().min(0).max(100),
    })
    .optional(),
  peopleCount: z.number().int().min(0).max(50).optional(),
});

export type DescribeImageInput = {
  bytes: Buffer;
  mimeType?: string;
  filePath?: string;
};

export type DescribeImageResult =
  | {
      ok: true;
      analysis: ImageContentAnalysis;
      description: string;
      tags: string[];
      analysisStatus: "vision";
      durationMs: number;
    }
  | {
      ok: false;
      analysisStatus: "unavailable";
      reason: string;
      provider: string;
      durationMs: number;
    };

const SYSTEM_PROMPT = `You describe photos for a senior-living campus newsletter layout engine.
Return ONLY JSON matching the schema. Rules:
- Describe visible scene, objects, activities, setting, and orientation.
- subjectBounds must cover all people and the primary subject as percentages of the full image (0-100).
- peopleCount is a count only. Never name or identify individuals.
- Never infer medical status, diagnoses, disabilities, or private identity details.
- Prefer concrete visible nouns (meal, dining table, chess, outdoor cookout, military medals, bubbles) over abstract mood words.
- Do not claim the photo documents a named real-world event.`;

const USER_PROMPT = `Describe this image for photo-to-story matching and subject-safe cropping.
JSON keys: scene (string), objects (string[]), orientation ("landscape"|"portrait"|"square"),
subjectBounds ({left,top,right,bottom} 0-100), peopleCount (int).`;

function aiEnv() {
  return {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
    OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    AI_PROVIDER: process.env.AI_PROVIDER ?? "auto",
    UPLOAD_DIR: process.env.UPLOAD_DIR ?? "./storage/uploads",
  };
}

function contentHash(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function mimeFromPath(filePath?: string, fallback = "image/jpeg"): string {
  const ext = path.extname(filePath ?? "").toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return fallback;
}

function cacheDir(): string {
  return path.resolve(aiEnv().UPLOAD_DIR, "..", "image-analysis-cache");
}

function cachePath(hash: string, model: string): string {
  const safeModel = model.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return path.join(cacheDir(), `${hash}.${safeModel}.${IMAGE_DESCRIPTION_PROMPT_VERSION}.json`);
}

async function readCache(hash: string, model: string): Promise<ImageContentAnalysis | null> {
  try {
    const raw = await fs.readFile(cachePath(hash, model), "utf8");
    const parsed = ImageContentAnalysisSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return { ...parsed.data, cached: true };
  } catch {
    return null;
  }
}

async function writeCache(analysis: ImageContentAnalysis): Promise<void> {
  if (!analysis.contentHash) return;
  try {
    await fs.mkdir(cacheDir(), { recursive: true });
    await fs.writeFile(
      cachePath(analysis.contentHash, analysis.model),
      JSON.stringify({ ...analysis, cached: false }, null, 2),
      "utf8",
    );
  } catch {
    // best-effort
  }
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  return JSON.parse(raw);
}

function tagsFromAnalysis(data: z.infer<typeof VisionPayloadSchema>): string[] {
  const bag = new Set<string>();
  for (const token of `${data.scene} ${data.objects.join(" ")}`.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (token.length > 2) bag.add(token);
  }
  return [...bag].slice(0, 24);
}

async function callGeminiVision(bytes: Buffer, mimeType: string, ms: number): Promise<z.infer<typeof VisionPayloadSchema>> {
  const env = aiEnv();
  if (!env.GEMINI_API_KEY || env.AI_PROVIDER === "local") {
    throw new Error("gemini_unavailable");
  }
  const client = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  const model = client.getGenerativeModel({
    model: GEMINI_VISION_MODEL,
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    systemInstruction: SYSTEM_PROMPT,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const result = await model.generateContent(
      [
        { text: USER_PROMPT },
        { inlineData: { data: bytes.toString("base64"), mimeType } },
      ],
      { signal: controller.signal },
    );
    const text = result.response.text();
    const parsed = VisionPayloadSchema.safeParse(extractJson(text));
    if (!parsed.success) throw new Error(`gemini_schema:${parsed.error.message}`);
    return parsed.data;
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenAiVision(bytes: Buffer, mimeType: string, ms: number): Promise<z.infer<typeof VisionPayloadSchema>> {
  const env = aiEnv();
  if (!env.OPENAI_API_KEY) throw new Error("openai_unavailable");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: 0.2,
        response_format: env.AI_PROVIDER === "local" ? { type: "text" } : { type: "json_object" },
        messages: [
          { role: "system", content: `${SYSTEM_PROMPT}\nReturn only valid JSON.` },
          {
            role: "user",
            content: [
              { type: "text", text: USER_PROMPT },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${bytes.toString("base64")}` },
              },
            ],
          },
        ],
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`openai_${response.status}:${body.slice(0, 180)}`);
    }
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const text = json.choices?.[0]?.message?.content;
    if (!text) throw new Error("openai_empty");
    const parsed = VisionPayloadSchema.safeParse(extractJson(text));
    if (!parsed.success) throw new Error(`openai_schema:${parsed.error.message}`);
    return parsed.data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function describeImagePixels(
  input: DescribeImageInput,
  opts: { timeoutMs?: number } = {},
): Promise<DescribeImageResult> {
  const startedAt = Date.now();
  const hash = contentHash(input.bytes);
  const mimeType = input.mimeType ?? mimeFromPath(input.filePath);
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const env = aiEnv();

  const preferredModel =
    env.GEMINI_API_KEY && env.AI_PROVIDER !== "local" ? GEMINI_VISION_MODEL : env.OPENAI_MODEL || "none";
  const cached = await readCache(hash, preferredModel);
  if (cached) {
    return {
      ok: true,
      analysis: cached,
      description: cached.scene,
      tags: tagsFromAnalysis({
        scene: cached.scene,
        objects: cached.objects ?? [],
        orientation: cached.orientation,
        subjectBounds: cached.subjectBounds,
        peopleCount: cached.peopleCount,
      }),
      analysisStatus: "vision",
      durationMs: Date.now() - startedAt,
    };
  }

  let lastErr: unknown = new Error("no_vision_provider");
  let provider: "gemini" | "openai" | "none" = "none";
  let model = "none";
  let payload: z.infer<typeof VisionPayloadSchema> | null = null;

  if (env.GEMINI_API_KEY && env.AI_PROVIDER !== "local") {
    try {
      payload = await callGeminiVision(input.bytes, mimeType, timeoutMs);
      provider = "gemini";
      model = GEMINI_VISION_MODEL;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!payload && (env.AI_PROVIDER === "local" || env.OPENAI_API_KEY)) {
    try {
      payload = await callOpenAiVision(input.bytes, mimeType, timeoutMs);
      provider = "openai";
      model = env.OPENAI_MODEL;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!payload) {
    return {
      ok: false,
      analysisStatus: "unavailable",
      reason: String(lastErr instanceof Error ? lastErr.message : lastErr),
      provider: env.GEMINI_API_KEY ? "gemini-failed" : env.OPENAI_API_KEY ? "openai-failed" : "none",
      durationMs: Date.now() - startedAt,
    };
  }

  const analysis: ImageContentAnalysis = {
    scene: payload.scene.trim(),
    objects: payload.objects ?? [],
    orientation: payload.orientation,
    subjectBounds: payload.subjectBounds,
    peopleCount: payload.peopleCount,
    provider,
    model,
    promptVersion: IMAGE_DESCRIPTION_PROMPT_VERSION,
    contentHash: hash,
    cached: false,
  };
  await writeCache(analysis);
  return {
    ok: true,
    analysis,
    description: analysis.scene,
    tags: tagsFromAnalysis(payload),
    analysisStatus: "vision",
    durationMs: Date.now() - startedAt,
  };
}

export function applyImageDescription(
  image: NewsImage,
  result: DescribeImageResult,
): NewsImage {
  if (!result.ok) {
    return {
      ...image,
      analysisStatus: "unavailable",
      contentAnalysis: {
        scene: "",
        objects: [],
        provider: result.provider,
        model: "none",
        promptVersion: IMAGE_DESCRIPTION_PROMPT_VERSION,
      },
    };
  }
  return {
    ...image,
    description: result.description,
    tags: result.tags,
    analysisStatus: "vision",
    contentAnalysis: result.analysis,
    aspect:
      result.analysis.orientation === "portrait" ||
      result.analysis.orientation === "square" ||
      result.analysis.orientation === "landscape"
        ? result.analysis.orientation
        : image.aspect,
  };
}

export function hasVisibleImageEvidence(image: NewsImage): boolean {
  if (image.analysisStatus === "unavailable" || image.analysisStatus === "skipped") return false;
  if (image.contentAnalysis?.scene?.trim()) return true;
  if (image.analysisStatus === "vision" || image.analysisStatus === "fixture") {
    return Boolean(image.description?.trim());
  }
  if (image.source === "STOCK" && image.description?.trim()) return true;
  return false;
}

export function visibleEvidenceText(image: NewsImage): string {
  const analysis = image.contentAnalysis;
  return [
    analysis?.scene,
    ...(analysis?.objects ?? []),
    image.description,
    ...(image.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}
