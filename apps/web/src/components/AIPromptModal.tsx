import { useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";
import {
  applyAiEdit,
  listAiEdits,
  unlockAi,
  type RecentAiEdit,
} from "../api/endpoints";

interface Props {
  runId: string;
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
}

type Phase = "locked" | "ready" | "running" | "error";

export function AIPromptModal({ runId, open, onClose, onApplied }: Props) {
  const [phase, setPhase] = useState<Phase>("locked");
  const [password, setPassword] = useState("");
  const [unlockErr, setUnlockErr] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [prompt, setPrompt] = useState("");
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [resultSummary, setResultSummary] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentAiEdit[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset when reopening, try unlock fast-path via listing.
  useEffect(() => {
    if (!open) return;
    setUnlockErr(null);
    setAiErr(null);
    setResultSummary(null);
    // Optimistically attempt the recent prompts endpoint; if it succeeds the
    // cookie is still valid.
    listAiEdits(runId)
      .then((res) => {
        setRecent(res.edits.slice(0, 3));
        setPhase("ready");
      })
      .catch(() => {
        setPhase("locked");
      });
  }, [open, runId]);

  // Lockout timer.
  useEffect(() => {
    if (!lockedUntil) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  // ESC closes (but not while running).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "running") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, phase, onClose]);

  if (!open) return null;

  const remainingLock = lockedUntil
    ? Math.max(0, Math.ceil((lockedUntil - now) / 1000))
    : 0;
  const lockActive = lockedUntil !== null && remainingLock > 0;

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (lockActive) return;
    setUnlockErr(null);
    try {
      await unlockAi(runId, password);
      setPassword("");
      setLockedUntil(null);
      const r = await listAiEdits(runId).catch(() => ({ edits: [] }));
      setRecent(r.edits.slice(0, 3));
      setPhase("ready");
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        if (e.status === 429) {
          const sec = e.retryAfterSec ?? e.body?.retryAfter ?? 30;
          setLockedUntil(Date.now() + sec * 1000);
          setUnlockErr(`Too many tries — locked out.`);
        } else if (e.status === 401) {
          setUnlockErr("Wrong password. Try again.");
        } else {
          setUnlockErr("Couldn't unlock — please try again.");
        }
      } else {
        setUnlockErr("Couldn't unlock — please try again.");
      }
    }
  }

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setPhase("running");
    setAiErr(null);
    setResultSummary(null);
    try {
      const res = await applyAiEdit(runId, prompt.trim());
      setResultSummary(res.summary ?? "Done.");
      setPrompt("");
      const r = await listAiEdits(runId).catch(() => ({ edits: [] }));
      setRecent(r.edits.slice(0, 3));
      setPhase("ready");
      onApplied();
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        if (e.status === 401 || e.status === 403) {
          setPhase("locked");
          setAiErr("Your session expired. Please unlock again.");
        } else if (e.status === 429) {
          const sec = e.retryAfterSec ?? 60;
          setAiErr(`Slow down — try again in ${sec}s.`);
          setPhase("ready");
        } else {
          setAiErr("AI edit unavailable, please try again.");
          setPhase("ready");
        }
      } else {
        setAiErr("AI edit unavailable, please try again.");
        setPhase("ready");
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={(e) => {
        if (phase !== "running" && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
        role="dialog"
        aria-modal
        aria-labelledby="ai-modal-title"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3">
          <span className="text-2xl">✨</span>
          <div className="flex-1">
            <h2 id="ai-modal-title" className="font-semibold text-slate-900">
              AI Layout Assistant
            </h2>
            <p className="text-xs text-slate-500">
              Describe a layout change in plain English.
            </p>
          </div>
          <button
            className="text-slate-400 hover:text-slate-700"
            onClick={onClose}
            disabled={phase === "running"}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4">
          {phase === "locked" && (
            <form onSubmit={handleUnlock} className="space-y-3">
              <p className="text-sm text-slate-600">
                Enter the demo password to enable AI editing for this session.
              </p>
              <input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="input"
                disabled={lockActive}
              />
              {unlockErr && (
                <p className="text-sm text-rose-600">{unlockErr}</p>
              )}
              {lockActive && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  Locked out. Try again in <strong>{remainingLock}s</strong>.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={!password || lockActive}
                >
                  Unlock
                </button>
              </div>
            </form>
          )}

          {(phase === "ready" || phase === "running") && (
            <form onSubmit={handleApply} className="space-y-3">
              <textarea
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the change you want…  e.g. 'Move the events sidebar to the top of page 2 and make the masthead larger.'"
                className="input resize-none"
                disabled={phase === "running"}
                maxLength={2000}
                autoFocus
              />
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{prompt.length}/2000</span>
                {phase === "running" && (
                  <span className="text-brand-primary animate-pulse">
                    Asking Gemini…
                  </span>
                )}
              </div>

              {aiErr && (
                <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded p-2">
                  {aiErr}
                </p>
              )}
              {resultSummary && !aiErr && (
                <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
                  ✓ {resultSummary}
                </p>
              )}

              {recent.length > 0 && (
                <div>
                  <h4 className="text-[11px] uppercase tracking-widest text-slate-400 mb-1">
                    Recent prompts
                  </h4>
                  <ul className="space-y-1.5 max-h-32 overflow-auto">
                    {recent.map((r) => (
                      <li
                        key={r.id}
                        className="text-xs text-slate-600 border border-slate-100 rounded p-2 hover:bg-slate-50 cursor-pointer"
                        onClick={() => setPrompt(r.prompt)}
                        title="Click to reuse"
                      >
                        <div className="truncate">{r.prompt}</div>
                        {r.diffSummary && (
                          <div className="text-slate-400 mt-0.5 truncate">
                            {r.diffSummary}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onClose}
                  disabled={phase === "running"}
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={phase === "running" || prompt.trim().length < 4}
                >
                  {phase === "running" ? "Working…" : "Apply with AI"}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="px-5 py-2 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
          <span>Powered by Gemini 2.5 Flash</span>
          <span>Edits are scoped to this run.</span>
        </div>
      </div>
    </div>
  );
}
