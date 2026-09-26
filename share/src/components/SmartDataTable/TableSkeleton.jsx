'use client';

// Width classes cycle per cell to give organic-looking variance
const WIDTHS = ['w-1/2', 'w-3/5', 'w-2/3', 'w-3/4', 'w-2/5', 'w-full'];

function SkeletonBar({ row, col }) {
  const w = WIDTHS[(row * 3 + col * 2) % WIDTHS.length];
  const delay = `${((row * 6 + col) * 30) % 600}ms`;
  return (
    <div
      className={`h-3 rounded bg-surface-disabled animate-pulse ${w}`}
      style={{ animationDelay: delay }}
    />
  );
}

/**
 * Floating spinner + message card. Positioned absolute, so the parent must be relative.
 * Pass message=null to render nothing.
 */
export function LoadingOverlay({ message = 'Loading data…' }) {
  if (message == null) return null;
  // Flat translucent scrim, not a backdrop blur: the system has no glass
  // surfaces, and blur over a scrolling virtualised table is expensive.
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center rounded bg-surface/70">
      <div className="flex items-center gap-3">
        <span className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-line-subtle border-t-brand" />
        <span className="text-sm text-ds-secondary">{message}</span>
      </div>
    </div>
  );
}

/**
 * Skeleton placeholder that mirrors a DataTable's visual structure.
 * When `message` is set, floats a spinner card on top of the skeleton.
 *
 * @param {{
 *   columns?:  Array<{ field: string }>,
 *   rowCount?: number,
 *   message?:  React.ReactNode,
 * }} props
 */
export function TableSkeleton({ columns = [], rowCount = 10, colCount: colCountProp, message = 'Loading data…' }) {
  const colCount = columns.length || colCountProp || 6;

  return (
    <div className="relative w-full">

      {/* ── Table skeleton ──────────────────────────────────── */}
      <div className="w-full overflow-hidden rounded border border-line">

        {/* Column headers */}
        <div className="flex divide-x divide-line-subtle border-b-2 border-line bg-sunken">
          {Array.from({ length: colCount }).map((_, i) => (
            <div key={i} className="flex-1 px-4 py-3">
              <div
                className={`h-3 rounded bg-surface-disabled animate-pulse ${WIDTHS[i % WIDTHS.length]}`}
                style={{ animationDelay: `${(i * 40) % 300}ms` }}
              />
            </div>
          ))}
        </div>

        {/* Filter row */}
        <div className="flex divide-x divide-line-subtle border-b border-line-subtle bg-surface">
          {Array.from({ length: colCount }).map((_, i) => (
            <div key={i} className="flex-1 px-3 py-2">
              <div
                className="h-8 w-full rounded bg-sunken animate-pulse"
                style={{ animationDelay: `${(i * 30) % 300}ms` }}
              />
            </div>
          ))}
        </div>

        {/* Data rows */}
        {Array.from({ length: rowCount }).map((_, row) => (
          <div
            key={row}
            className={`flex divide-x divide-line-subtle border-b border-line-subtle ${row % 2 === 0 ? 'bg-surface' : 'bg-sunken'}`}
          >
            {Array.from({ length: colCount }).map((_, col) => (
              <div key={col} className="flex-1 px-4 py-field">
                <SkeletonBar row={row} col={col} />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ── Overlay message (absolute, floats above skeleton) ── */}
      <LoadingOverlay message={message} />
    </div>
  );
}
