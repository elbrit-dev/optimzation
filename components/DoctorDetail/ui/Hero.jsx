"use client";

/**
 * The hero card: who the doctor is, the ROI read, the stat strip, the clinic
 * chips and the three actions — one card, as approved.
 *
 * The compact layout is a different arrangement of the same facts rather than
 * the wide one shrunk: at 392px the three-column identity block and the
 * right-aligned ROI plate stack into a title, one meta line and a pill.
 */

import React from "react";
import { Skeleton } from "./parts";

export default function Hero({
  doctor, compact, loading, since, age,
  roiTill, canSeeService, stats,
  clinics, clinicIndex, onPickClinic, onAddClinic, onOpenMap,
  pharmacyCount, onOpenRx,
  onAddPob, onAddNote, onRequestService,
}) {
  const clinic = clinics[clinicIndex] ?? null;
  const hue = clinic?.hue ?? "#1e3a8a";
  const mapLink = clinic?.lat && clinic?.lon
    ? "https://www.openstreetmap.org/?mlat=" + clinic.lat + "&mlon=" + clinic.lon
      + "#map=16/" + clinic.lat + "/" + clinic.lon
    : null;

  const meta = [doctor.spec, doctor.qual, [doctor.city, doctor.hq].filter(Boolean).join(" · ")]
    .filter(Boolean);

  return (
    <section className="dx-card">
      {compact ? (
        <div className="dx-hero--c">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1>{doctor.name}</h1>
            <div className="dx-sub dx-break">
              {[doctor.spec, doctor.id, doctor.city].filter(Boolean).join(" · ")}
            </div>
            <div className="dx-sub2 dx-break">
              {[doctor.catLine || "No category on file", age ? "on file " + age : null]
                .filter(Boolean).join(" · ")}
            </div>
          </div>
          <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
            {canSeeService ? (
              <div className="dx-roi--c"><span>ROI</span><b className="dx-num">{roiTill}</b></div>
            ) : null}
            <button type="button" className="dx-rx--c" onClick={onOpenRx}
              aria-label={"Show " + pharmacyCount + " linked pharmacies"}>
              Rx · {pharmacyCount}
            </button>
          </div>
        </div>
      ) : (
        <div className="dx-hero">
          <div className="dx-avatar">{doctor.initials}</div>
          <div className="dx-hero-main">
            <h1>{doctor.name}</h1>
            <div className="dx-hero-line">
              {meta.map((bit, i) => (
                <React.Fragment key={bit}>
                  {i ? <span className="dx-pipe">|</span> : null}
                  <span className={i === 0 ? "dx-strong" : undefined}>{bit}</span>
                </React.Fragment>
              ))}
              {loading && !meta.length ? <Skeleton h={12} w={180} /> : null}
            </div>
            <div className="dx-hero-tags">
              <span className="dx-code">{doctor.id}</span>
              {doctor.cats.map((c) => <span className="dx-tag" key={c}>{c}</span>)}
              {doctor.divisions.map((d) => <span className="dx-tag" key={d.key}>{d.key}</span>)}
              {since ? <span className="dx-hero-since">On file {since} · {age}</span> : null}
            </div>
          </div>
          <div className="dx-hero-side">
            {canSeeService ? (
              <div className="dx-roi">
                <span>ROI till date</span>
                <b className="dx-num">{roiTill}</b>
              </div>
            ) : null}
            <button type="button" className="dx-rx" onClick={onOpenRx}
              aria-label={"Show " + pharmacyCount + " linked pharmacies"}>
              <i>Rx</i>
              {pharmacyCount} {pharmacyCount === 1 ? "pharmacy" : "pharmacies"}
            </button>
          </div>
        </div>
      )}

      {stats.length ? (
        <div className="dx-stats">
          {stats.map((s) => (
            <div className="dx-stat" key={s.l}>
              <span className="dx-stat-l">{s.l}</span>
              <div className={"dx-stat-v dx-num dx-break" + (s.accent ? " dx-stat-v--accent" : "")}>{s.v}</div>
              <div className="dx-stat-s dx-break">{s.s}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="dx-clinics">
        <div className="dx-clinic-row">
          <span className="dx-eyebrow">Clinic</span>
          {clinics.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPickClinic(i)}
              className={"dx-chip" + (i === clinicIndex ? " dx-chip--on" : "")}
              style={i === clinicIndex ? { background: c.hue, borderColor: c.hue } : undefined}
            >
              {i === clinicIndex ? null : <i style={{ background: c.hue }} />}
              {c.tag}
            </button>
          ))}
          {!clinics.length && !loading ? (
            <span className="dx-strip-note">No address on file for this doctor</span>
          ) : null}
          {!compact && onAddClinic ? (
            <button type="button" className="dx-chip dx-chip--add" onClick={onAddClinic} aria-label="Add a clinic">
              <i>+</i>Add clinic
            </button>
          ) : null}
        </div>

        {clinic ? (
          <div className="dx-clinic-meta">
            <span className="dx-text dx-clip" title={[clinic.name, clinic.addr, clinic.days].filter(Boolean).join(" · ")}>
              {clinic.name} · {clinic.addr}
              {clinic.days ? " · " + clinic.days : " · timings not on file"}
            </span>
            {!compact ? (
              <div className="dx-clinic-acts">
                {onAddClinic ? (
                  <button type="button" className="dx-map-btn" onClick={onAddClinic}
                    aria-label="Add a clinic" style={{ border: "1px solid " + hue, color: hue }}>
                    + Add clinic
                  </button>
                ) : null}
                <button type="button" className="dx-map-btn" onClick={onOpenMap}
                  style={{ border: "1px solid " + hue, color: hue }}>
                  Map
                </button>
                {mapLink ? (
                  <a className="dx-dir" href={mapLink} target="_blank" rel="noreferrer" style={{ color: hue }}>
                    Directions
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {compact ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {onAddClinic ? (
              <button type="button" className="dx-chip dx-chip--add" onClick={onAddClinic} aria-label="Add a clinic">
                <i>+</i>Add clinic
              </button>
            ) : null}
            <div className="dx-spring" />
            {clinic ? (
              <button type="button" className="dx-map-btn" onClick={onOpenMap}
                style={{ border: "1px solid " + hue, color: hue, padding: "0 13px" }}>
                Map
              </button>
            ) : null}
            {mapLink ? (
              <a className="dx-dir" href={mapLink} target="_blank" rel="noreferrer" style={{ color: hue }}>
                Directions
              </a>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="dx-acts">
        <button type="button" className="dx-btn dx-btn--primary" onClick={onAddPob}>Add POB</button>
        <button type="button" className="dx-btn" onClick={onAddNote}>Notes</button>
        {onRequestService ? (
          <button type="button" className="dx-btn dx-btn--ghost" onClick={onRequestService}>
            {compact ? "Service" : "Request service"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
