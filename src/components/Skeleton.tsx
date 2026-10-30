import { cn } from '../lib/cn';

/** A grey placeholder bar shown while content loads. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('block h-3 animate-pulse rounded bg-surface-sunken', className)}
    />
  );
}

interface TableSkeletonProps {
  rows?: number;
  /** Relative widths of the columns, matching the real table so nothing jumps when data arrives. */
  columns?: string[];
  label?: string;
}

/**
 * Loading state for lists. Shapes match the real table rows (Figma "State · Loading"); the label
 * is announced to screen readers.
 */
export function TableSkeleton({
  rows = 8,
  columns = ['w-6', 'w-14', 'w-64', 'w-16', 'w-14', 'w-20', 'w-28'],
  label = 'Loading',
}: TableSkeletonProps) {
  return (
    <div role="status" aria-label={label} className="rounded-xl border border-border bg-surface">
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="flex items-center gap-6 border-b border-border px-5 py-4 last:border-b-0"
        >
          {columns.map((width, column) => (
            <Skeleton key={column} className={cn(width, column === 0 && 'size-3.5 rounded-full')} />
          ))}
        </div>
      ))}
    </div>
  );
}
