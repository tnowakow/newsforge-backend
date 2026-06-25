import { cn } from "../lib/cn";

export function LoadingSkeleton({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("animate-pulse space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 bg-slate-200 rounded w-full" />
      ))}
    </div>
  );
}

export function CardSkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="card p-4 h-44 animate-pulse flex flex-col gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-slate-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-200 rounded w-3/4" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
          </div>
          <div className="flex-1 h-3 bg-slate-100 rounded" />
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-slate-200" />
            <div className="w-6 h-6 rounded-full bg-slate-200" />
            <div className="w-6 h-6 rounded-full bg-slate-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ErrorState({
  title = "Something went sideways",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="card p-6 text-center max-w-md mx-auto">
      <div className="text-rose-500 text-2xl">⚠</div>
      <h3 className="mt-2 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{message}</p>
      {onRetry && (
        <button className="btn-secondary mt-4" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card p-8 text-center max-w-md mx-auto">
      <div className="text-slate-300 text-4xl">∅</div>
      <h3 className="mt-2 font-semibold text-slate-700">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
