import { useEffect, useMemo, useState } from "react";
import { defaultMonth, defaultPicks, indexAnswer, isOpen, scopeOfPicks, scorecard } from "@/app/review-report/data/selectors";

/* The Report section's numbers: the person's last full month of Target,
 * Primary and Secondary, from the same read-only server script the Review
 * Report page uses (elbrit_sm_review, src/app/review-report/server). Called
 * as the token's user, so it is THEIR seat and everything under it. Only the
 * three blocks the card draws are asked for (tree, sales, secondary).
 *
 * → { status: "off" | "loading" | "ready" | "error", data?, error? } */

function authHeader(raw) {
  const t = String(raw ?? "").trim();
  return /^(token|bearer)\s/i.test(t) ? t : `token ${t}`;
}

function lastFullMonth(today) {
  const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function call(url, token, params) {
  const origin = new URL(url).origin;
  const res = await fetch(`${origin}/api/method/elbrit_sm_review?${new URLSearchParams(params)}`, {
    headers: { Authorization: authHeader(token), Accept: "application/json" },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.exc_type || !json.message) throw new Error(json.exc_type || `Review read failed (${res.status})`);
  return json.message;
}

/* What the card draws: the Review Report page's default scope (as the
   Visit report) — the person's own seat and branch, or for a token with no
   seat of its own that sees the whole Sales tree (IT) every SM's branch. */
export function reviewSummary(core) {
  const ix = indexAnswer(core);
  if (!ix.tree.length) return null;
  const mi = defaultMonth(ix);
  const picks = defaultPicks(ix);
  const whole = picks.length > 1;
  const scope = scopeOfPicks(ix, picks);
  return {
    name: whole ? "All teams" : scope.label,
    whole,
    month: ix.months[mi],
    open: isOpen(ix, mi),
    sc: scorecard(ix, scope, mi),
  };
}

export function useReviewSection({ url, token, today, enabled }) {
  const [core, setCore] = useState({ status: "off" });
  const upto = lastFullMonth(today);

  useEffect(() => {
    if (!enabled || !url || !token) {
      setCore({ status: "off" });
      return undefined;
    }
    let alive = true;
    setCore({ status: "loading" });
    call(url, token, { upto, parts: "tree,sales,secondary" })
      .then((d) => alive && setCore({ status: "ready", data: d }))
      .catch((e) => alive && setCore({ status: "error", error: e.message }));
    return () => { alive = false; };
  }, [url, token, upto, enabled]);

  const data = useMemo(() => (core.status === "ready" ? reviewSummary(core.data) : null), [core]);
  return { status: core.status, error: core.error, data };
}
