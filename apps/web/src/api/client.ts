/**
 * Tiny fetch wrapper. Treats every non-2xx response as an `ApiError`. Always
 * sends cookies (the AI unlock flow uses a signed cookie) and JSON-encodes
 * bodies unless callers pass a FormData.
 */

const RAW_BASE = (import.meta.env.VITE_API_URL ?? "").trim();
/** Joinable base URL — empty string means "same origin + Vite proxy". */
export const API_BASE = RAW_BASE.replace(/\/+$/, "");

export interface ApiErrorBody {
  error?: string;
  message?: string;
  retryAfter?: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody | null;
  readonly retryAfterSec: number | null;

  constructor(status: number, body: ApiErrorBody | null, retryAfterSec: number | null) {
    super(body?.message ?? body?.error ?? `Request failed (${status})`);
    this.status = status;
    this.body = body;
    this.retryAfterSec = retryAfterSec;
  }
}

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

interface RequestOptions {
  method?: HttpMethod;
  json?: unknown;
  formData?: FormData;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(opts.headers ?? {}),
  };
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.formData) {
    body = opts.formData;
  }
  const res = await fetch(url, {
    method: opts.method ?? (body ? "POST" : "GET"),
    headers,
    body,
    credentials: "include",
    signal: opts.signal,
  });

  const retryAfterHeader = res.headers.get("Retry-After");
  const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) || null : null;

  if (!res.ok) {
    let errBody: ApiErrorBody | null = null;
    try {
      errBody = (await res.json()) as ApiErrorBody;
    } catch {
      errBody = null;
    }
    throw new ApiError(res.status, errBody, retryAfterSec);
  }

  // Some POSTs (PDF download) return non-JSON; callers there use raw fetch.
  const ct = res.headers.get("Content-Type") ?? "";
  if (!ct.includes("application/json")) {
    return (await res.text()) as unknown as T;
  }
  return (await res.json()) as T;
}

/** Download a binary file from the API (used for PDF). */
export async function requestBlob(
  path: string,
  opts: RequestOptions = {},
): Promise<{ blob: Blob; filename: string | null }> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  }
  const res = await fetch(url, {
    method: opts.method ?? "POST",
    headers,
    body,
    credentials: "include",
    signal: opts.signal,
  });
  if (!res.ok) {
    let errBody: ApiErrorBody | null = null;
    try {
      errBody = (await res.json()) as ApiErrorBody;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, errBody, null);
  }
  const cd = res.headers.get("Content-Disposition") ?? "";
  const match = cd.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] ?? null;
  return { blob: await res.blob(), filename };
}
