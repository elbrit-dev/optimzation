"use client";

/**
 * Doctor Service on the doctor page — the approved design's "Add service"
 * button (between Add POB and Notes) and its "Services" card (parked: the
 * page does not show it until that is decided).
 *
 * WHO, from ERP and nothing else: the Doctor Service options script answers
 * for the signed-in token. The MIS team and IT get the button; anyone else
 * sees nothing — the read is made, refused, and nothing is drawn.
 *
 * The form and the reads live with the two Doctor Service pages in
 * share/src/app/doctor-service, so the doctor page and those pages write
 * exactly the same way.
 */

import { useCallback, useEffect, useState } from "react";

import { useServiceClient } from "@/app/doctor-service/data/useClient";
import { ServiceForm } from "@/app/doctor-service/components/ServiceForm";
import { Toast, useToast } from "@/app/doctor-service/components/parts";
import { ensureStyles } from "@/app/doctor-service/components/styles";
import { fDY, money } from "@/app/doctor-service/data/workflow";

/* The insight script's statuses (an app row's tracker, mapped). */
const STATUS = {
  "Not submitted": ["#F1F3F6", "#4B5563"],
  "In approval": ["#EAF1FF", "#1D4ED8"],
  "Sent back": ["#FEF3E2", "#B45309"],
  Approved: ["#E5F6EC", "#15803D"],
  Rejected: ["#FDECEC", "#B91C1C"],
  Paid: ["#E5F6EC", "#15803D"],
};

/** → { client, viewer, insight, reload } for one doctor. `insight` is read
 *  only with withInsight — it feeds ServicesCard, which the page does not
 *  show for now. */
export function useDoctorServices({ url, token, erpUrl, authToken, sampleData, doctorId, withInsight = false }) {
  const { client } = useServiceClient({ url: url || erpUrl, token: token || authToken, sampleData, sampleRole: "MIS" });
  const [viewer, setViewer] = useState(null);
  const [insight, setInsight] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    if (!client || !doctorId) return undefined;
    let live = true;
    client.options().then((o) => { if (live) setViewer(o.viewer); }).catch(() => { if (live) setViewer(null); });
    return () => { live = false; };
  }, [client, doctorId]);

  useEffect(() => {
    if (!withInsight || !client || !doctorId || !viewer?.can_view) return undefined;
    let live = true;
    client.insight(doctorId).then((x) => { if (live) setInsight(x); }).catch(() => { if (live) setInsight(null); });
    return () => { live = false; };
  }, [withInsight, client, doctorId, viewer?.can_view, attempt]);

  return { client, viewer, insight, reload };
}

export function ServicesCard({ insight, limit = 6 }) {
  ensureStyles();
  const [all, setAll] = useState(false);
  const rows = insight?.services ?? [];
  const shown = all ? rows : rows.slice(0, limit);
  return (
    <div className="dsv">
      <div className="dsv-svcard">
        <div className="h">
          <b>Services</b>
          <i />
          <span>{rows.length ? `${rows.length} total` : ""}</span>
        </div>
        {shown.map((r) => {
          const c = STATUS[r.status] || STATUS["Not submitted"];
          return (
            <div key={r.name} className="dsv-svrow">
              <span className="d">{fDY(r.date)}</span>
              <span className="m"><b>{r.service}</b><span>{r.via_app ? `for ${r.by_name}` : "ERP record"}</span></span>
              <span className="dsv-pill" style={{ background: c[0], color: c[1] }}>{r.status}</span>
              <span className="a">{money(r.amount)}</span>
            </div>
          );
        })}
        {!rows.length ? <span style={{ fontSize: 13, color: "#6B7280", padding: "6px 0" }}>No services for this doctor yet.</span> : null}
        {rows.length > limit ? (
          <button type="button" className="more" onClick={() => setAll((a) => !a)}>{all ? "Show fewer" : `Show all ${rows.length}`}</button>
        ) : null}
      </div>
    </div>
  );
}

/** The form, mounted while open; refreshes the card after a save. */
export function AddServiceDrawer({ svc, doctor, onClose, onSaved }) {
  const [toast, show] = useToast();
  return (
    <>
      {doctor ? (
        <ServiceForm
          client={svc.client}
          doctor={doctor}
          viewer={svc.viewer}
          onClose={onClose}
          onSaved={(r) => { onClose(); svc.reload(); if (!r.quiet) show(r.message); onSaved?.(r); }}
        />
      ) : null}
      <Toast toast={toast} />
    </>
  );
}
