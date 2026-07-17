/**
 * AiRearrangeModal — Sofia Screen 6.
 *
 * Password-gated. Reuses the v1 <AiPromptModal> unlock flow (the shared
 * `newsforge.aiUnlocked` sessionStorage flag) by mirroring the same
 * unlock UX in-modal, but calls `api.aiRearrange(...)` instead of the
 * AI-edit path once unlocked. Per Sofia's handoff: we do NOT fork the
 * password field — the AiPromptModal owns the shared cookie/localStorage
 * plumbing, and this component defers to that same session flag.
 *
 * If the shared flag is missing when the operator lands here, we surface
 * the same unlock form (single field, POST /api/runs/unlock) so the
 * modal remains self-contained without duplicating logic.
 */
import { useEffect, useRef, useState } from "react";
import { Modal, ModalHeader } from "./ui/Modal";
import { Button } from "./ui/Button";
import { api, ApiError } from "@/lib/api";
import type { RunRecord, TemplateRecord } from "@/lib/types";

const UNLOCK_KEY = "newsforge.aiUnlocked";
const MAX_HINT_LEN = 2000;

interface Props {
  open: boolean;
  runId: string;
  currentTemplateId: string | null;
  templates: TemplateRecord[];
  onClose: () => void;
  onApplied: (result: {
    run: RunRecord;
    chosenBy: "ai" | "deterministic-fallback";
    chosenTemplateId: string;
    reason: string;
  }) => void;
}

export function AiRearrangeModal({
  open,
  runId,
  currentTemplateId,
  templates,
  onClose,
  onApplied,
}: Props) {
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(UNLOCK_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const [hint, setHint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setFailure(null);
    setPwError(null);
    // Recheck unlock state on every open — user may have unlocked via AiPromptModal.
    try {
      setUnlocked(sessionStorage.getItem(UNLOCK_KEY) === "1");
    } catch {
      setUnlocked(false);
    }
  }, [open]);

  useEffect(() => {
    if (open && unlocked) {
      setTimeout(() => textareaRef.current?.focus(), 60);
    }
  }, [open, unlocked]);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (password.length === 0) return;
    setUnlocking(true);
    setPwError(null);
    try {
      await api.unlock(password);
      try {
        sessionStorage.setItem(UNLOCK_KEY, "1");
      } catch {
        // ignore storage failure; unlock cookie is set server-side too
      }
      setUnlocked(true);
      setPassword("");
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 401
          ? "That's not it. Try again."
          : err instanceof ApiError
            ? err.message
            : "Couldn't unlock.";
      setPwError(msg);
    } finally {
      setUnlocking(false);
    }
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      const trimmed = hint.trim();
      const result = await api.aiRearrange(
        runId,
        trimmed.length >= 3 ? trimmed : undefined,
      );
      onApplied(result);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Cookie expired — bounce back to locked view.
        try {
          sessionStorage.removeItem(UNLOCK_KEY);
        } catch {
          /* ignore */
        }
        setUnlocked(false);
        setFailure(null);
        return;
      }
      const msg =
        err instanceof ApiError
          ? err.message
          : "Gemini didn't respond in time.";
      setFailure(
        err instanceof ApiError && err.status === 429
          ? "Gemini is over rate limit — try again in a minute."
          : msg,
      );
    } finally {
      setSubmitting(false);
    }
  }

  const currentName =
    templates.find((t) => t.id === currentTemplateId)?.name ?? "Template";

  return (
    <Modal
      open={open}
      onClose={onClose}
      widthClass="w-[560px]"
      labelledBy="ai-rearrange-title"
    >
      <ModalHeader
        title={
          <span id="ai-rearrange-title">
            {unlocked ? (
              <>
                <span className="text-accent">✨</span> AI Re-arrange
              </>
            ) : (
              <>🔒 Unlock AI Re-arrange</>
            )}
          </span>
        }
        subtitle={
          unlocked
            ? "Ask Gemini to re-pick the template. Deterministic fallback if it fails."
            : "AI actions require the shared demo password."
        }
        onClose={onClose}
      />

      {!unlocked ? (
        <form onSubmit={handleUnlock} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Password
            </label>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPwError(null);
              }}
              className={`w-full h-10 px-3 bg-surface border rounded-md text-sm focus:outline-none ${
                pwError ? "border-error" : "border-rule focus:border-accent"
              }`}
            />
            {pwError && (
              <div className="mt-1.5 text-2xs text-error">⚠ {pwError}</div>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-rule">
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={password.length === 0}
              loading={unlocking}
            >
              Unlock →
            </Button>
          </div>
        </form>
      ) : submitting ? (
        <div className="p-8 text-center">
          <div className="text-3xl mb-3 animate-pulse">✨✨✨</div>
          <div className="font-medium text-sm">Gemini is picking a template…</div>
          <div className="text-2xs text-ink-muted mt-1">
            (this usually takes 3–8 seconds)
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="ghost" disabled>
              Cancel
            </Button>
            <Button variant="primary" loading disabled>
              Working…
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-5 space-y-4">
          <div className="text-sm">
            <span className="text-ink-muted">Current template:</span>{" "}
            <span className="font-medium">{currentName}</span>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Optional hint for the AI (leave blank to let it decide):
            </label>
            <textarea
              ref={textareaRef}
              rows={4}
              value={hint}
              onChange={(e) => setHint(e.target.value.slice(0, MAX_HINT_LEN))}
              placeholder='e.g. "keep the resident story on the left page"'
              className="w-full font-mono text-sm p-3 bg-surface border border-rule rounded-md focus:border-accent focus:outline-none resize-y"
            />
            <div className="text-2xs text-ink-muted mt-1">
              Tip: Gemini will pick from the {templates.length} Trilogy templates.
            </div>
          </div>

          <div className="rounded-md bg-accent-soft text-ink text-xs px-3 py-2">
            ⓘ If Gemini fails, we fall back to the deterministic pick — your
            content is safe either way.
          </div>

          {failure && (
            <div className="text-sm text-error bg-error/5 border border-error/20 rounded-md px-3 py-2">
              {failure}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-rule">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit}>
              ✨ AI Re-arrange
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
