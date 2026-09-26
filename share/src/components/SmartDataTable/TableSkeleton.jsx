'use client';

// Width classes cycle per cell to give organic-looking variance
const WIDTHS = ['w-1/2', 'w-3/5', 'w-2/3', 'w-3/4', 'w-2/5', 'w-full'];

function SkeletonBar({ row, col }) {
  const w = WIDTHS[(row * 3 + col * 2) % WIDTHS.length];
  const delay = `${((row * 6 + col) * 30) % 600}ms`;
  return (
    <div
      className={`h-3 rounded bg-gray-200 animate-pulse ${w}`}
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
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center rounded backdrop-blur-[2px]">
      <div className="flex items-center gap-3">
        <span className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-[3px] border-gray-200 border-t-blue-500" />
        <span className="text-sm text-gray-600">{message}</span>
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
      <div className="w-full overflow-hidden rounded border border-gray-300">

        {/* Column headers */}
        <div className="flex divide-x divide-gray-200 border-b-2 border-gray-300 bg-gray-100">
          {Array.from({ length: colCount }).map((_, i) => (
            <div key={i} className="flex-1 px-4 py-3">
              <div
                className={`h-3 rounded bg-gray-300 animate-pulse ${WIDTHS[i % WIDTHS.length]}`}
                style={{ animationDelay: `${(i * 40) % 300}ms` }}
              />
            </div>
          ))}
        </div>

        {/* Filter row */}
        <div className="flex divide-x divide-gray-200 border-b border-gray-200 bg-white">
          {Array.from({ length: colCount }).map((_, i) => (
            <div key={i} className="flex-1 px-3 py-2">
              <div
                className="h-8 w-full rounded bg-gray-100 animate-pulse"
                style={{ animationDelay: `${(i * 30) % 300}ms` }}
              />
            </div>
          ))}
        </div>

        {/* Data rows */}
        {Array.from({ length: rowCount }).map((_, row) => (
          <div
            key={row}
            className={`flex divide-x divide-gray-100 border-b border-gray-100 ${row % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
          >
            {Array.from({ length: colCount }).map((_, col) => (
              <div key={col} className="flex-1 px-4 py-[11px]">
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
