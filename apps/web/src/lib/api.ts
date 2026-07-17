import type {
  ClientSummary,
  ClientFull,
  MockContentResult,
  RunRecord,
  UploadResult,
  FillerMode,
  Article,
  NewsImage,
  AssembledLayout,
} from "./types";

const BASE = ""; // Vite proxy handles /api → :3001

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !(init.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: "include",
      ...init,
      headers,
    });
  } catch (err) {
    throw new ApiError(0, "Network error — couldn't reach the API.", err);
  }
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);
  if (!res.ok) {
    const msg =
      (payload && typeof payload === "object" && "error" in (payload as any)
        ? (payload as any).error
        : null) ||
      `Request failed (${res.status})`;
    throw new ApiError(res.status, msg, payload);
  }
  return payload as T;
}

/**
 * Marcus's Phase 3 backend wraps single-run reads/writes as `{ run: ... }`
 * (see `apps/api/src/routes/runs.ts` lines 235, 273, 470, etc.). v1's
 * `api.getRun` expected the run directly. This helper transparently
 * unwraps whichever shape lands, so we survive future churn.
 *
 * API-contract flag for John: the wrapping change is Marcus's v2 delta;
 * v1 pages relied on the unwrapped shape. Not patching the backend per
 * rule 1 — normalizing at the client boundary instead.
 */
function unwrapRun(payload: unknown): RunRecord {
  if (payload && typeof payload === "object" && "run" in (payload as any)) {
    return (payload as { run: RunRecord }).run;
  }
  return payload as RunRecord;
}

export const api = {
  // ---- Clients ----
  // v2: backend routes/clients.ts returns `{ clients: [...] }` and
  // `{ client: {...} }` respectively. Unwrap here so the SPA sees flat
  // shapes (matches how ClientPicker.tsx and Workspace.tsx consume them).
  // Missed in John's Phase 3.6 contract triage; caught post-deploy when
  // the site rendered blank because ClientPicker set the whole `{clients}`
  // object as state and .map() blew up. — Bob, 2026-07-17 02:18 UTC
  listClients: async (): Promise<ClientSummary[]> => {
    const raw = await request<{ clients: ClientSummary[] } | ClientSummary[]>(
      "/api/clients",
    );
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object" && "clients" in raw) {
      return (raw as { clients: ClientSummary[] }).clients ?? [];
    }
    return [];
  },
  getClient: async (id: string): Promise<ClientFull> => {
    const raw = await request<{ client: ClientFull } | ClientFull>(
      `/api/clients/${id}`,
    );
    if (raw && typeof raw === "object" && "client" in raw) {
      return (raw as { client: ClientFull }).client;
    }
    return raw as ClientFull;
  },

  // ---- Mock content ----
  generateMockContent: (
    clientId: string,
    opts?: {
      month?: string;
      tone?: string;
      density?: number;
      include?: string[];
    },
  ) =>
    request<MockContentResult>(`/api/clients/${clientId}/mock-content`, {
      method: "POST",
      body: JSON.stringify(opts ?? {}),
    }),

  // ---- Templates ----
  /**
   * v2 — typed helper for `GET /api/templates`. Backend returns
   * `{ templates: TemplateRecord[] }` (see routes/templates.ts:9-14).
   * Unwrapped here so callers get the array directly. Non-breaking;
   * `Workspace.tsx` still does a raw fetch and can migrate at leisure.
   */
  listTemplates: async (): Promise<unknown[]> => {
    const raw = await request<{ templates: unknown[] }>("/api/templates");
    return raw.templates ?? [];
  },

  // ---- Uploads ----
  upload: (files: File[], clientId?: string) => {
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    if (clientId) fd.append("clientId", clientId);
    return request<UploadResult>("/api/uploads", {
      method: "POST",
      body: fd,
    });
  },

  // ---- Runs ----
  createRun: async (input: {
    clientId: string;
    templateId?: string;
    monthLabel?: string;
    fillerMode?: FillerMode;
    articles?: Article[];
    images?: NewsImage[];
  }): Promise<RunRecord> => {
    const raw = await request<unknown>("/api/runs", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return unwrapRun(raw);
  },

  getRun: async (runId: string): Promise<RunRecord> => {
    const raw = await request<unknown>(`/api/runs/${runId}`);
    return unwrapRun(raw);
  },

  /**
   * v2 §Screen 9 — list approved (or filter by status) runs.
   * Backend: `GET /api/runs?status=approved` → `{ runs, total, limit, offset }`
   * (see routes/runs.ts:239).
   */
  listApprovedRuns: async (): Promise<RunRecord[]> => {
    const raw = await request<{ runs: RunRecord[]; total: number }>(
      "/api/runs?status=approved&limit=200",
    );
    return raw.runs ?? [];
  },

  editBlock: (
    runId: string,
    input: {
      blockId: string;
      action: "move" | "resize" | "swap" | "delete";
      payload: Record<string, unknown>;
    },
  ) =>
    request<{ layout: AssembledLayout; version: number }>(
      `/api/runs/${runId}/edit`,
      { method: "POST", body: JSON.stringify(input) },
    ),

  /**
   * v2 — variant defaults to "web" for backward-compat with v1 callers.
   * Backend: `POST /api/runs/:id/pdf?variant=web|print` (routes/runs.ts:600).
   */
  generatePdf: (
    runId: string,
    variant: "web" | "print" = "web",
  ) =>
    request<{ pdfUrl: string; pdfPath: string; variant?: string }>(
      `/api/runs/${runId}/pdf?variant=${variant}`,
      { method: "POST" },
    ),

  // ---- AI ----
  unlock: (password: string) =>
    request<{ ok?: boolean; unlocked?: boolean }>("/api/runs/unlock", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  aiEdit: (
    runId: string,
    prompt: string,
    password?: string,
  ) =>
    request<{ layout: AssembledLayout; diff: unknown; status: string }>(
      `/api/runs/${runId}/ai-edit`,
      {
        method: "POST",
        body: JSON.stringify({ prompt, ...(password ? { password } : {}) }),
      },
    ),

  /**
   * v2 §4.3 — password-gated AI template re-arrange.
   * `<AiPromptModal>` owns the shared unlock cookie; on 401 the frontend
   * re-opens the unlock flow. Response includes `chosenBy` so QA can
   * verify deterministic-fallback behaviour (v2 rule 14).
   */
  aiRearrange: async (
    runId: string,
    hint?: string,
    password?: string,
  ): Promise<{
    run: RunRecord;
    chosenTemplateId: string;
    chosenBy: "ai" | "deterministic-fallback";
    reason: string;
  }> => {
    const body: Record<string, unknown> = {};
    if (hint && hint.trim().length >= 3) body.prompt = hint.trim();
    if (password) body.password = password;
    const raw = await request<{
      run: RunRecord;
      chosenTemplateId: string;
      chosenBy: "ai" | "deterministic-fallback";
      reason: string;
    }>(`/api/runs/${runId}/ai-arrange`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return raw;
  },

  /**
   * v2 §4.1 — Approve (no password). Backend renders web PDF, print PDF,
   * and InDesign bundle in parallel; response bundles all three URLs.
   */
  approve: async (
    runId: string,
    actorId?: string,
    notes?: string,
  ): Promise<{
    run: RunRecord;
    pdfWebUrl: string | null;
    pdfPrintUrl: string | null;
    bundleUrl: string | null;
    errors?: string[];
  }> => {
    const body: Record<string, unknown> = {};
    if (actorId) body.approvedBy = actorId;
    if (notes) body.notes = notes;
    return request(`/api/runs/${runId}/approve`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  /**
   * v2 §4.2 — Request changes (no password). Notes is required, name
   * is optional and scaffolds v3 auth.
   */
  requestChanges: async (
    runId: string,
    comment: string,
    actorId?: string,
  ): Promise<{ run: RunRecord }> => {
    const body: Record<string, unknown> = { notes: comment };
    if (actorId) body.requestedBy = actorId;
    return request(`/api/runs/${runId}/request-changes`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  /**
   * v2 §4.4 — Build (or fetch cached) InDesign bundle. 24h signed URL.
   * `regenerate: true` forces a rebuild; the cache is otherwise keyed
   * on (runId, layoutVersion).
   */
  exportBundle: async (
    runId: string,
    regenerate = false,
  ): Promise<{
    bundleUrl: string;
    sizeBytes: number;
    layoutVersion: number;
    builtAt: string;
  }> =>
    request(`/api/runs/${runId}/export/indesign-bundle`, {
      method: "POST",
      body: JSON.stringify({ regenerate }),
    }),

  /**
   * v2 §4.5 — Static instructional .docx. Returns a URL the caller can
   * hand to an `<a href>` so the browser drives the download UI.
   * NOT gated by client, NOT gated by AI unlock.
   */
  submissionTemplateUrl: () => "/api/templates/submission-template.docx",

  /**
   * v2 — client-side compliance-flag acknowledge (no server endpoint;
   * Sofia's Screen 3 handoff §Data source, and Vitaly's arch flags
   * this as v3 scope). Persists to sessionStorage keyed by runId+flagId.
   */
  acknowledgeComplianceFlag: (runId: string, flagId: string) => {
    try {
      sessionStorage.setItem(`nf.compliance.ack.${runId}.${flagId}`, "1");
    } catch {
      // sessionStorage disabled — silently swallow, badge just won't
      // decrement across refresh (already the demo compromise).
    }
  },
  isComplianceFlagAcknowledged: (runId: string, flagId: string): boolean => {
    try {
      return sessionStorage.getItem(`nf.compliance.ack.${runId}.${flagId}`) === "1";
    } catch {
      return false;
    }
  },
};
