"use client";

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`animate-pulse rounded bg-slate-700/50 ${className}`} />;
}

export function ProfileSkeleton() {
  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 animate-fade-in">
      <nav className="lg:w-52 shrink-0">
        <ul className="flex flex-row lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10 w-full lg:w-32 rounded-lg" />
          ))}
        </ul>
      </nav>
      <main className="min-w-0 flex-1 space-y-6">
        <div className="glass-panel p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <Skeleton className="h-14 w-14 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-10 w-24 rounded-lg" />
          </div>
        </div>
        <div className="glass-panel p-4 sm:p-5">
          <Skeleton className="h-4 w-36 mb-4" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="glass-panel p-4 sm:p-5">
          <Skeleton className="h-4 w-28 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-slate-700/60">
          <tr>
            {[1, 2, 3, 4, 5].map((i) => (
              <th key={i} className="px-4 py-3 text-left">
                <Skeleton className="h-4 w-16" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i}>
              {[1, 2, 3, 4, 5].map((j) => (
                <td key={j} className="px-4 py-3">
                  <Skeleton className="h-4 w-full max-w-[120px]" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
