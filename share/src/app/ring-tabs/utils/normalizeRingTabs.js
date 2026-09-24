/* Studio and the harness editor both hand this whatever was typed, so it
   accepts the loose shapes and returns exactly what RingTabBar renders.

   Accepted per entry:
     - a string                     "Leave" -> { id: 'leave', label: 'Leave' }
     - { id?, label?, ...item }     id falls back to the label, label to the id
     - `progress: 30`               percent done (0-100, clamped): green for
                                    done, red for the rest owed
     - `segments: [...]`            the full ProgressRing contract; wins over
                                    `progress` when both are given

   Dropped: nulls, entries with neither id nor label, and every repeat of an
   id after its first — two tabs with one id would select together and share
   one panel, which is never what was meant. */

function slug(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* Percent done, 0-100. A numeric string ("30") is accepted because a Studio
   binding to a text field produces one. Anything else draws no ring data. */
function progressSegments(progress) {
  if (typeof progress !== 'number' && !(typeof progress === 'string' && progress.trim() !== '')) {
    return undefined;
  }
  const pct = Number(progress);
  if (!Number.isFinite(pct)) return undefined;
  const done = Math.min(Math.max(pct, 0), 100);
  return [
    { key: 'done', value: done, tone: 'success', label: 'Done' },
    { key: 'owed', value: 100 - done, tone: 'danger', label: 'Pending' },
  ];
}

export function normalizeRingTab(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string' || typeof raw === 'number') {
    const label = String(raw).trim();
    const id = slug(label);
    return id ? { id, label } : null;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;

  const rawId = raw.id != null && raw.id !== '' ? String(raw.id) : null;
  const rawLabel = raw.label != null && raw.label !== '' ? String(raw.label) : null;
  const id = rawId ?? (rawLabel ? slug(rawLabel) : null);
  if (!id) return null;

  const { progress, ...rest } = raw;
  return {
    ...rest,
    id,
    label: rawLabel ?? id,
    segments: Array.isArray(raw.segments) ? raw.segments : progressSegments(progress),
    disabled: raw.disabled === true,
  };
}

export function normalizeRingTabs(tabs) {
  if (!Array.isArray(tabs)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of tabs) {
    const tab = normalizeRingTab(raw);
    if (!tab || seen.has(tab.id)) continue;
    seen.add(tab.id);
    out.push(tab);
  }
  return out;
}
