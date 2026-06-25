import { useEffect, useState } from "react";

const PHASES = [
  "Analyzing content…",
  "Fitting to brand…",
  "Flowing pages…",
  "Finalizing output…",
];

/**
 * Full-screen blocking overlay that cycles a status line and shows an animated
 * SVG "AI brain" of pulsing nodes connected by faint edges.
 */
export function ProcessingOverlay({
  visible,
  errorMessage,
  onErrorDismiss,
}: {
  visible: boolean;
  errorMessage?: string | null;
  onErrorDismiss?: () => void;
}) {
  const [phaseIdx, setPhaseIdx] = useState(0);

  useEffect(() => {
    if (!visible || errorMessage) return;
    const id = setInterval(() => {
      setPhaseIdx((i) => (i + 1) % PHASES.length);
    }, 1400);
    return () => clearInterval(id);
  }, [visible, errorMessage]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
    >
      <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 max-w-md w-[28rem] text-center">
        <AiBrain />
        {errorMessage ? (
          <>
            <h2 className="mt-4 text-lg font-semibold text-rose-600">
              Assembly failed
            </h2>
            <p className="mt-2 text-sm text-slate-600">{errorMessage}</p>
            <button onClick={onErrorDismiss} className="btn-secondary mt-4">
              Close
            </button>
          </>
        ) : (
          <>
            <h2 className="mt-4 text-lg font-semibold text-slate-800">
              Assembling your newsletter
            </h2>
            <p
              className="mt-2 text-sm text-brand-primary font-medium min-h-[1.25rem]"
              key={phaseIdx}
            >
              {PHASES[phaseIdx]}
            </p>
            <div className="mt-4 h-1 bg-slate-100 rounded overflow-hidden">
              <div className="h-full w-1/3 bg-brand-primary animate-[indet_1.6s_linear_infinite]" />
            </div>
            <style>{`@keyframes indet { 0% { transform: translateX(-100%);} 100% { transform: translateX(300%);} }`}</style>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Hand-built SVG: 7 nodes arranged in a soft constellation with faint
 * connecting edges. Each node pulses on a slight delay to read as a
 * "neural net thinking" animation. No external assets.
 */
function AiBrain() {
  const nodes = [
    { cx: 80, cy: 40, r: 6, delay: "0s" },
    { cx: 30, cy: 70, r: 7, delay: "0.2s" },
    { cx: 130, cy: 65, r: 7, delay: "0.4s" },
    { cx: 60, cy: 110, r: 8, delay: "0.6s" },
    { cx: 110, cy: 115, r: 7, delay: "0.8s" },
    { cx: 20, cy: 140, r: 6, delay: "1.0s" },
    { cx: 140, cy: 140, r: 6, delay: "1.2s" },
  ];
  const edges: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 3],
    [2, 4],
    [3, 4],
    [3, 5],
    [4, 6],
    [1, 4],
    [2, 3],
  ];
  return (
    <svg
      viewBox="0 0 160 170"
      className="mx-auto w-32 h-32"
      role="img"
      aria-label="AI processing animation"
    >
      <defs>
        <radialGradient id="halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(var(--brand-primary-rgb))" stopOpacity="0.25" />
          <stop offset="100%" stopColor="rgb(var(--brand-primary-rgb))" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="80" cy="90" r="80" fill="url(#halo)" />
      <g stroke="rgb(var(--brand-primary-rgb))" strokeOpacity="0.25" strokeWidth="1">
        {edges.map(([a, b], i) => (
          <line
            key={i}
            x1={nodes[a]!.cx}
            y1={nodes[a]!.cy}
            x2={nodes[b]!.cx}
            y2={nodes[b]!.cy}
          />
        ))}
      </g>
      <g fill="rgb(var(--brand-primary-rgb))">
        {nodes.map((n, i) => (
          <circle
            key={i}
            cx={n.cx}
            cy={n.cy}
            r={n.r}
            style={{ animationDelay: n.delay, transformOrigin: `${n.cx}px ${n.cy}px` }}
            className="animate-node-pulse"
          />
        ))}
      </g>
    </svg>
  );
}
