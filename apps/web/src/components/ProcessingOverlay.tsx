import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./ui/Button";

export type ProcessingStage =
  | "working"
  | "error"
  | "done";

interface ProcessingOverlayProps {
  open: boolean;
  /** Overrides the cycling status with a fixed message. */
  fixedMessage?: string;
  /** Cycle of status messages. Default Sofia spec. */
  messages?: string[];
  stage?: ProcessingStage;
  errorTitle?: string;
  errorBody?: string;
  onCancel?: () => void;
  onTryAgain?: () => void;
  onBack?: () => void;
}

const DEFAULT_MESSAGES = [
  "Analyzing content…",
  "Fitting to brand…",
  "Flowing pages…",
  "Finalizing output…",
];

export function ProcessingOverlay({
  open,
  fixedMessage,
  messages = DEFAULT_MESSAGES,
  stage = "working",
  errorTitle = "Something snagged while assembling.",
  errorBody,
  onCancel,
  onTryAgain,
  onBack,
}: ProcessingOverlayProps) {
  const [idx, setIdx] = useState(0);
  const [stillWorking, setStillWorking] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    if (!open || stage !== "working" || fixedMessage) return;
    const t = window.setInterval(
      () => setIdx((i) => (i + 1) % messages.length),
      1600,
    );
    return () => window.clearInterval(t);
  }, [open, stage, fixedMessage, messages.length]);

  useEffect(() => {
    if (!open || stage !== "working") {
      setStillWorking(false);
      return;
    }
    const t = window.setTimeout(() => setStillWorking(true), 8000);
    return () => window.clearTimeout(t);
  }, [open, stage]);

  useEffect(() => {
    if (!open) {
      setIdx(0);
      setConfirmCancel(false);
    }
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center p-6 scrim animate-fadeIn">
      <AiBrain stage={stage} />

      <div className="mt-6 text-center">
        <div
          key={`${stage}-${idx}`}
          className={`text-lg font-medium ${
            stage === "error" ? "text-[#FFD3B5]" : "text-white"
          } animate-fadeIn`}
        >
          {stage === "error"
            ? errorTitle
            : stage === "done"
              ? "Done."
              : (fixedMessage ?? messages[idx])}
        </div>
        {stage === "working" && (
          <div className="mt-3 mx-auto w-64 h-px bg-white/30 overflow-hidden relative">
            <span className="absolute inset-y-0 -left-1/3 w-1/3 bg-white/70 animate-[shimmer_1.4s_linear_infinite]" />
          </div>
        )}
        {stillWorking && stage === "working" && (
          <div className="mt-2 text-sm text-white/60">Still working…</div>
        )}
        {stage === "error" && errorBody && (
          <div className="mt-2 text-sm text-white/70 max-w-md">{errorBody}</div>
        )}
      </div>

      <div className="absolute bottom-10 left-0 right-0 flex justify-center gap-3">
        {stage === "working" && onCancel && !confirmCancel && (
          <button
            onClick={() => setConfirmCancel(true)}
            className="text-white/80 hover:text-white border border-white/40 hover:border-white px-4 h-10 rounded-md text-sm transition-colors"
          >
            Cancel
          </button>
        )}
        {stage === "working" && confirmCancel && (
          <div className="flex items-center gap-3 text-white">
            <span className="text-sm">Stop and discard?</span>
            <button
              onClick={onCancel}
              className="px-3 h-9 rounded-md border border-white text-sm"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmCancel(false)}
              className="px-3 h-9 rounded-md text-sm border border-white/30 hover:border-white/60"
            >
              No
            </button>
          </div>
        )}
        {stage === "error" && (
          <>
            {onTryAgain && (
              <Button variant="primary" onClick={onTryAgain}>
                Try again
              </Button>
            )}
            {onBack && (
              <button
                onClick={onBack}
                className="text-white/80 hover:text-white border border-white/40 px-4 h-10 rounded-md text-sm"
              >
                Back to workspace
              </button>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function AiBrain({ stage }: { stage: ProcessingStage }) {
  const stroke = stage === "error" ? "rgba(255,180,120,0.9)" : "rgba(255,255,255,0.85)";
  const spark = stage === "error" ? "#FFB37A" : "rgb(var(--accent))";
  const nodes = [
    { cx: 120, cy: 120, r: 12 },
    { cx: 60, cy: 70, r: 7 },
    { cx: 180, cy: 70, r: 7 },
    { cx: 40, cy: 150, r: 6 },
    { cx: 200, cy: 150, r: 6 },
    { cx: 90, cy: 200, r: 6 },
    { cx: 150, cy: 200, r: 6 },
  ];
  const edges: [number, number][] = [
    [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6],
    [1, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 6],
  ];

  return (
    <svg
      width={240}
      height={240}
      viewBox="0 0 240 240"
      className={stage === "error" ? "" : "drop-shadow-[0_0_30px_rgba(255,255,255,0.15)]"}
      aria-hidden
    >
      <defs>
        <radialGradient id="brain-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.5)" />
          <stop offset="60%" stopColor="rgba(255,255,255,0.0)" />
        </radialGradient>
      </defs>
      <circle
        cx="120"
        cy="120"
        r="100"
        fill="url(#brain-glow)"
        className="animate-breathe"
      />
      {edges.map(([a, b], i) => (
        <line
          key={i}
          x1={nodes[a].cx}
          y1={nodes[a].cy}
          x2={nodes[b].cx}
          y2={nodes[b].cy}
          stroke={stroke}
          strokeOpacity={0.4 + (i % 3) * 0.15}
          strokeWidth={1.5}
        >
          <animate
            attributeName="stroke-opacity"
            values="0.2;0.8;0.2"
            dur="2s"
            begin={`${(i * 0.12) % 1.6}s`}
            repeatCount="indefinite"
          />
        </line>
      ))}
      {/* travelling spark on edge 0-1 */}
      {stage !== "error" && (
        <circle r="3.5" fill={spark}>
          <animateMotion
            dur="2.4s"
            repeatCount="indefinite"
            path={`M${nodes[0].cx},${nodes[0].cy} L${nodes[1].cx},${nodes[1].cy} L${nodes[2].cx},${nodes[2].cy} L${nodes[4].cx},${nodes[4].cy} L${nodes[6].cx},${nodes[6].cy} L${nodes[5].cx},${nodes[5].cy} L${nodes[3].cx},${nodes[3].cy} Z`}
          />
        </circle>
      )}
      {nodes.map((n, i) => (
        <g
          key={i}
          style={{
            transformOrigin: `${n.cx}px ${n.cy}px`,
            animation:
              stage === "working"
                ? `pulseNode 1.6s ease-in-out ${i * 0.18}s infinite`
                : "none",
          }}
        >
          <circle
            cx={n.cx}
            cy={n.cy}
            r={n.r}
            fill={stroke}
            opacity={i === 0 ? 0.95 : 0.85}
          />
        </g>
      ))}
    </svg>
  );
}
