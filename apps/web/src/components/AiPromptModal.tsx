import { useEffect, useRef, useState } from "react";
import { Modal, ModalHeader } from "./ui/Modal";
import { Button } from "./ui/Button";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";

interface AiPromptModalProps {
  open: boolean;
  runId: string;
  onClose: () => void;
  /** Called with the new layout when AI edit succeeds. */
  onApplied: (layout: unknown, status: string) => void;
  /** Called when user opts for fallback after a failure. */
  onFallback?: () => void;
}

const STORAGE_KEY = "newsforge.recentPrompts";
const UNLOCK_KEY = "newsforge.aiUnlocked";
const MAX_RECENT = 3;

export function AiPromptModal({
  open,
  runId,
  onClose,
  onApplied,
  onFallback,
}: AiPromptModalProps) {
  const { toast } = useToast();
  const [unlocked, setUnlocked] = useState<boolean>(
    () => sessionStorage.getItem(UNLOCK_KEY) === "1",
  );
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const [prompt, setPrompt] = useState("");
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as string[]).slice(0, MAX_RECENT) : [];
    } catch {
      return [];
    }
  });

  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!lockUntil) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [lockUntil]);

  useEffect(() => {
    if (open && unlocked) {
      // focus textarea on open
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open, unlocked]);

  // Reset transient state on close
  useEffect(() => {
    if (!open) {
      setFailure(null);
      setPassword("");
      setPwError(null);
    }
  }, [open]);

  const secondsLeft =
    lockUntil && lockUntil > now ? Math.ceil((lockUntil - now) / 1000) : 0;

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (password.length === 0 || secondsLeft > 0) return;
    setUnlocking(true);
    setPwError(null);
    try {
      await api.unlock(password);
      sessionStorage.setItem(UNLOCK_KEY, "1");
      setUnlocked(true);
      setAttempts(0);
      setPassword("");
    } catch (err) {
      const next = attempts + 1;
      setAttempts(next);
      setShake(true);
      setTimeout(() => setShake(false), 400);
      const msg =
        err instanceof ApiError && err.status === 401
          ? "That's not it. Try again."
          : err instanceof ApiError
            ? err.message
            : "Couldn't unlock.";
      setPwError(msg);
      if (next >= 3) {
        setLockUntil(Date.now() + 15_000);
        setAttempts(0);
      }
    } finally {
      setUnlocking(false);
    }
  }

  function saveRecent(p: string) {
    setRecent((cur) => {
      const next = [p, ...cur.filter((x) => x !== p)].slice(0, MAX_RECENT);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  async function applyPrompt() {
    const trimmed = prompt.trim();
    if (trimmed.length < 4) return;
    setSubmitting(true);
    setFailure(null);
    try {
      const result = await api.aiEdit(runId, trimmed);
      saveRecent(trimmed);
      onApplied(result.layout, result.status ?? "ok");
      onClose();
      toast("Applied your prompt.", { tone: "success" });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Gemini didn't respond in time.";
      setFailure(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void applyPrompt();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      widthClass={unlocked ? "w-[640px]" : "w-[480px]"}
      labelledBy="ai-prompt-title"
    >
      <ModalHeader
        title={
          <span id="ai-prompt-title">
            <span className="text-accent">✦</span> AI Prompt
          </span>
        }
        subtitle={
          unlocked
            ? "Describe a change and we'll reshape the newsletter."
            : "Demo access required."
        }
        onClose={onClose}
      />

      {failure ? (
        <GeminiFailure
          message={failure}
          onTryAgain={() => {
            setFailure(null);
            void applyPrompt();
          }}
          onFallback={() => {
            setFailure(null);
            onFallback?.();
            onClose();
          }}
        />
      ) : !unlocked ? (
        <form onSubmit={handleUnlock} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Enter demo password
            </label>
            <input
              type="password"
              autoFocus
              value={password}
              disabled={secondsLeft > 0}
              onChange={(e) => {
                setPassword(e.target.value);
                setPwError(null);
              }}
              className={`w-full h-10 px-3 bg-surface border rounded-md text-sm focus:outline-none ${
                pwError ? "border-error" : "border-rule focus:border-accent"
              } ${shake ? "animate-shake" : ""}`}
            />
            {pwError && (
              <div className="mt-1.5 text-2xs text-error flex items-center gap-1">
                ⚠ {pwError}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={password.length === 0 || secondsLeft > 0}
              loading={unlocking}
            >
              {secondsLeft > 0 ? `Try again in ${secondsLeft}s` : "Unlock →"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="p-5 space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Describe the change you want…
            </label>
            <div className="relative">
              <textarea
                ref={textareaRef}
                rows={6}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`e.g. "Make the events page warmer, add a bigger photo of the garden party, and shorten the menu section."`}
                className="w-full font-mono text-sm leading-[22px] p-3 bg-surface border border-rule rounded-md focus:border-accent focus:outline-none resize-y min-h-[140px] max-h-[280px]"
              />
              <span className="absolute bottom-2 right-3 text-2xs text-ink-muted bg-surface/80 px-1.5 py-0.5 rounded">
                ⌘+Enter
              </span>
            </div>
          </div>

          {recent.length > 0 && (
            <div>
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">
                Recent prompts
              </div>
              <ul className="space-y-1">
                {recent.map((p, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 text-sm hover:bg-bg rounded px-2 py-1 cursor-pointer group"
                    onClick={() => setPrompt(p)}
                  >
                    <span className="text-ink-muted">─</span>
                    <span className="truncate flex-1">"{p}"</span>
                    <span className="opacity-0 group-hover:opacity-100 text-ink-muted">
                      ↩
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-2xs text-ink-muted">
            Powered by Gemini 2.5 Flash
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-rule">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={submitting}
              disabled={prompt.trim().length < 4}
              title={
                prompt.trim().length < 4
                  ? "Describe a change first."
                  : undefined
              }
              onClick={applyPrompt}
            >
              ✦ Apply with AI
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function GeminiFailure({
  message,
  onTryAgain,
  onFallback,
}: {
  message: string;
  onTryAgain: () => void;
  onFallback: () => void;
}) {
  return (
    <div className="p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="text-warn text-lg" aria-hidden>
          ⚠
        </span>
        <div>
          <div className="font-display font-semibold text-base">
            AI couldn't apply your prompt
          </div>
          <p className="text-sm text-ink-muted mt-1">
            {message ||
              "Gemini didn't respond in time."}{" "}
            Your newsletter wasn't changed — your previous version is intact.
          </p>
          <p className="text-sm text-ink-muted mt-2">
            Want to try again, or use a generic fallback layout refresh instead?
          </p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-rule">
        <Button variant="secondary" onClick={onFallback}>
          Use fallback
        </Button>
        <Button variant="primary" onClick={onTryAgain}>
          ✦ Try again
        </Button>
      </div>
    </div>
  );
}
