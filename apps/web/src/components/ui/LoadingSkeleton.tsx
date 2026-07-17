import { cn } from "@/lib/cn";

interface SkeletonProps {
  className?: string;
  /** w-_ */
  w?: string;
  /** h-_ */
  h?: string;
  rounded?: string;
}

export function Skeleton({ className, w, h, rounded = "rounded" }: SkeletonProps) {
  return <div className={cn("skeleton", rounded, w, h, className)} />;
}

export function LoadingSkeleton({ className }: { className?: string }) {
  return <Skeleton className={className} h="h-4" w="w-full" />;
}

export function CardSkeleton() {
  return (
    <div className="bg-surface border border-rule rounded-xl p-4 shadow-card">
      <Skeleton h="h-12" w="w-12" rounded="rounded-md" />
      <Skeleton className="mt-4" h="h-4" w="w-3/4" />
      <Skeleton className="mt-2" h="h-3" w="w-1/2" />
      <div className="mt-4 flex gap-1.5">
        <Skeleton h="h-3" w="w-3" rounded="rounded-full" />
        <Skeleton h="h-3" w="w-3" rounded="rounded-full" />
        <Skeleton h="h-3" w="w-3" rounded="rounded-full" />
      </div>
      <Skeleton className="mt-5" h="h-5" w="w-16" rounded="rounded-full" />
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="page-surface mx-auto p-12 animate-fadeIn">
      <Skeleton h="h-3" w="w-32" />
      <Skeleton className="mt-3" h="h-10" w="w-3/4" />
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Skeleton h="h-3" w="w-full" />
          <Skeleton h="h-3" w="w-5/6" />
          <Skeleton h="h-3" w="w-4/6" />
          <Skeleton h="h-3" w="w-full" />
          <Skeleton h="h-3" w="w-3/5" />
        </div>
        <Skeleton h="h-48" w="w-full" rounded="rounded-lg" />
      </div>
      <div className="mt-6 grid grid-cols-3 gap-3">
        <Skeleton h="h-24" w="w-full" rounded="rounded-md" />
        <Skeleton h="h-24" w="w-full" rounded="rounded-md" />
        <Skeleton h="h-24" w="w-full" rounded="rounded-md" />
      </div>
    </div>
  );
}
