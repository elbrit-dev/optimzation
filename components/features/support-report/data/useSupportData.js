import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearSupportCache, makeConn } from "./erpClient";
import { fetchMonth, fetchMonthCount, fetchOrg, ymOf } from "./supportSource";
import { fyOfYm, makeTimeline } from "./model";

const MONTH_CONCURRENCY = 3;
const COUNT_CONCURRENCY = 6;
const RETRY_LIMIT = 3; // a month that stays short after ~90s is reported, not chased
const RETRY_BASE_MS = 15000;

async function inPool(items, limit, run) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await run(items[i]);
      }
    }),
  );
  return out;
}

function fyMonths(fy, untilYm) {
  const out = [];
  for (let k = 0; k < 12; k++) {
    const m = ((k + 3) % 12) + 1;
    const ym = ymOf(k < 9 ? fy : fy + 1, m);
    if (ym <= untilYm) out.push(ym);
  }
  return out;
}

/* Months on file, found by count. Starts with this FY and the last one and
   keeps stepping back a year while the earliest April counted still has
   records, so history of any depth is picked up without a fixed start. */
async function findMonthsOnFile(conn) {
  const now = new Date();
  const nowYm = ymOf(now.getFullYear(), now.getMonth() + 1);
  const curFy = fyOfYm(nowYm);
  const onFile = {};
  let fy = curFy - 1;
  let batch = [...fyMonths(fy, nowYm), ...fyMonths(curFy, nowYm)];
  for (let guard = 0; guard < 10; guard++) {
    const counts = await inPool(batch, COUNT_CONCURRENCY, (ym) => fetchMonthCount(conn, ym));
    batch.forEach((ym, i) => {
      onFile[ym] = counts[i];
    });
    if (!onFile[ymOf(fy, 4)]) break;
    fy -= 1;
    batch = fyMonths(fy, nowYm);
  }
  return onFile;
}

export function useSupportData({ url, token }) {
  const [attempt, setAttempt] = useState(0);
  const connResult = useMemo(() => {
    try {
      return { conn: makeConn({ url, token }) };
    } catch (e) {
      return { error: e.message };
    }
  }, [url, token]);
  const conn = connResult.conn;

  const [base, setBase] = useState({ status: "loading" });
  const [months, setMonths] = useState({});
  const [monthError, setMonthError] = useState(null);

  const gen = useRef(0);
  const queue = useRef([]);
  const queued = useRef(new Set());
  const active = useRef(0);
  const retries = useRef(new Map());
  const pumpRef = useRef(null);

  useEffect(() => {
    const g = ++gen.current;
    queue.current = [];
    queued.current = new Set();
    retries.current = new Map();
    active.current = 0;
    setMonths({});
    setMonthError(null);
    if (!conn) {
      setBase({ status: "error", error: connResult.error });
      return;
    }
    setBase({ status: "loading" });
    Promise.all([fetchOrg(conn), findMonthsOnFile(conn)])
      .then(([org, onFile]) => {
        if (g !== gen.current) return;
        const yms = Object.keys(onFile).filter((ym) => onFile[ym] > 0).sort();
        if (!yms.length) {
          setBase({ status: "empty", org });
          return;
        }
        const timeline = makeTimeline(fyOfYm(yms[0]), fyOfYm(yms[yms.length - 1]));
        setBase({ status: "ready", org, onFile, timeline });
      })
      .catch((e) => {
        if (g === gen.current) setBase({ status: "error", error: e.message });
      });
  }, [conn, connResult.error, attempt]);

  const pump = useCallback(() => {
    const g = gen.current;
    while (active.current < MONTH_CONCURRENCY && queue.current.length) {
      const ym = queue.current.shift();
      active.current++;
      fetchMonth(conn, ym)
        .then((data) => {
          if (g !== gen.current) return;
          setMonths((m) => ({ ...m, [ym]: data }));
          /* Short month: the ERP's count and rows disagreed. Show what came
             back (the banner says it's short) and ask again a little later,
             backing off, until they agree. */
          if (data.truncated) {
            const n = (retries.current.get(ym) || 0) + 1;
            retries.current.set(ym, n);
            if (n <= RETRY_LIMIT) {
              setTimeout(() => {
                if (g !== gen.current) return;
                queue.current.push(ym);
                pumpRef.current?.();
              }, RETRY_BASE_MS * n);
            }
          } else retries.current.delete(ym);
        })
        .catch((e) => {
          if (g !== gen.current) return;
          queued.current.delete(ym);
          setMonthError(e.message);
        })
        .finally(() => {
          if (g !== gen.current) return;
          active.current--;
          pump();
        });
    }
  }, [conn]);
  pumpRef.current = pump;

  /* Asked for in priority order on every render; only months not already
     loaded or waiting are queued, so repeating the ask is free. */
  const request = useCallback(
    (yms) => {
      if (!conn) return;
      let added = false;
      for (const ym of yms) {
        if (!ym || queued.current.has(ym)) continue;
        queued.current.add(ym);
        queue.current.push(ym);
        added = true;
      }
      if (added) pump();
    },
    [conn, pump],
  );

  const retry = useCallback(() => {
    clearSupportCache();
    setAttempt((a) => a + 1);
  }, []);

  return { ...base, months, monthError, request, retry };
}
