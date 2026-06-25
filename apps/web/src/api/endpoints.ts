import type {
  ClientSummaryDto,
  ClientFullDto,
  NewsletterRunDto,
  CreateRunRequest,
  EditRequest,
  Article,
  ImageRef,
} from "@newsforge/shared";
import { request, requestBlob } from "./client";

// ---------- Clients ----------
export function listClients(signal?: AbortSignal): Promise<{ clients: ClientSummaryDto[] }> {
  return request<{ clients: ClientSummaryDto[] }>("/api/clients", { signal });
}

export function getClient(id: string, signal?: AbortSignal): Promise<{ client: ClientFullDto }> {
  return request<{ client: ClientFullDto }>(`/api/clients/${encodeURIComponent(id)}`, { signal });
}

export interface MockContentResponse {
  articles: Article[];
  images: ImageRef[];
}

export function generateMockContent(
  clientId: string,
  body: {
    monthLabel: string;
    tone?: "warm" | "formal" | "playful" | "civic";
    density?: 1 | 2 | 3 | 4;
    includeSections?: string[];
  },
): Promise<MockContentResponse> {
  return request<MockContentResponse>(
    `/api/clients/${encodeURIComponent(clientId)}/mock-content`,
    { json: body },
  );
}

// ---------- Uploads ----------
export interface UploadIngestResponse {
  articles?: Article[];
  images?: ImageRef[];
  accepted?: number;
  rejected?: { name: string; reason: string }[];
  [k: string]: unknown;
}

export function uploadFiles(input: {
  clientId: string;
  runId?: string;
  files: File[];
  pastedText?: string;
}): Promise<UploadIngestResponse> {
  const fd = new FormData();
  fd.append("clientId", input.clientId);
  if (input.runId) fd.append("runId", input.runId);
  if (input.pastedText) fd.append("pastedText", input.pastedText);
  for (const f of input.files) fd.append("files", f, f.name);
  return request<UploadIngestResponse>("/api/uploads", { formData: fd });
}

// ---------- Runs ----------
export function createRun(body: CreateRunRequest): Promise<{ run: NewsletterRunDto }> {
  return request<{ run: NewsletterRunDto }>("/api/runs", { json: body });
}

export function getRun(id: string, signal?: AbortSignal): Promise<{ run: NewsletterRunDto }> {
  return request<{ run: NewsletterRunDto }>(`/api/runs/${encodeURIComponent(id)}`, { signal });
}

export function editRun(
  id: string,
  body: EditRequest,
): Promise<{ run: NewsletterRunDto }> {
  return request<{ run: NewsletterRunDto }>(`/api/runs/${encodeURIComponent(id)}/edit`, {
    json: body,
  });
}

// ---------- PDF ----------
export function downloadPdf(runId: string) {
  return requestBlob(`/api/runs/${encodeURIComponent(runId)}/pdf`, { method: "POST" });
}

// ---------- AI edit ----------
export function unlockAi(
  runId: string,
  password: string,
): Promise<{ unlocked: true }> {
  return request<{ unlocked: true }>(
    `/api/runs/${encodeURIComponent(runId)}/ai-edit/unlock`,
    { json: { password } },
  );
}

export interface AiEditResult {
  status: "ok" | "no-op" | "error";
  summary: string;
  diff?: unknown;
  geminiLatency?: number;
  aiEditId?: string;
  layout?: unknown;
}

export function applyAiEdit(
  runId: string,
  prompt: string,
): Promise<AiEditResult> {
  return request<AiEditResult>(`/api/runs/${encodeURIComponent(runId)}/ai-edit`, {
    json: { prompt },
  });
}

export interface RecentAiEdit {
  id: string;
  prompt: string;
  resultStatus: string;
  geminiLatency: number | null;
  diffSummary: string | null;
  createdAt: string;
}

export function listAiEdits(
  runId: string,
  signal?: AbortSignal,
): Promise<{ edits: RecentAiEdit[] }> {
  return request<{ edits: RecentAiEdit[] }>(
    `/api/runs/${encodeURIComponent(runId)}/ai-edits`,
    { signal },
  );
}

// ---------- Render URL helper ----------
/**
 * URL the iframe should load for live preview. Resolves via the same origin
 * (or VITE_API_URL when set). In dev the Vite proxy injects the internal
 * render secret on /render/* requests so the API's localOnlyWithSecret guard
 * passes.
 */
export function renderUrl(runId: string): string {
  const base = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "");
  return `${base}/render/${encodeURIComponent(runId)}`;
}
