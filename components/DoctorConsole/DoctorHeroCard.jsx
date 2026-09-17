"use client";

/**
 * Doctor · Hero card — a component in its own right.
 *
 * The identity card, whole: initials avatar, name, speciality | qualification |
 * city · HQ, the doctor code and category chips, the ROI plate and the
 * pharmacies button, the clinic chips with map and directions, and the Add POB
 * / Notes / Request service row.
 *
 * This is normally the card a page binds the doctor on, because it is the one
 * that must have one. The other four then attach to the same reading.
 *
 * The modals this card can open — the map, the pharmacy list, the note composer
 * and the POB dialog — are rendered here rather than by some page-level layer,
 * so a page that places only the hero still gets every button on it working.
 */

import React from "react";
import dynamic from "next/dynamic";

import Hero from "../DoctorDetail/ui/Hero";
import { MapModal, NoteModal, PharmacyModal } from "../DoctorDetail/ui/Modals";
import { CardShell, Unbound, useContainerMode } from "./shell";
import useDoctorConsole from "./useDoctorConsole";

// The POB capture drags in the calendar's form kit, its ERP services and the
// item master. The card renders fine without any of it, so it arrives the first
// time somebody presses Add POB.
const DoctorPobDialog = dynamic(() => import("../DoctorPobDialog"), { ssr: false });

export default function DoctorHeroCard(props) {
  const {
    showRoi = true, showClinics = true, showActions = true, layout = "auto",
    onAddClinic, onAddPharmacy, onRequestService, onPobSaved,
    className, style,
  } = props;

  const c = useDoctorConsole(props);
  const [ref, measured] = useContainerMode(720);

  if (!c) return <Unbound what="The doctor hero card" innerRef={ref} className={className} style={style} />;

  const compact = layout === "auto" ? measured : layout === "compact";
  const { on, ui } = c;
  const clinicIndex = Math.min(ui.clinicIdx, Math.max(0, c.clinics.length - 1));
  const ident = { doctor: c.doctor, code: c.doctorId };

  return (
    <CardShell innerRef={ref} compact={compact} className={className} style={style}>
      {c.fatal ? <div className="dx-warn" role="alert"><span>{c.fatal}</span></div> : null}

      <Hero
        doctor={c.doctor}
        compact={compact}
        loading={c.loading}
        since={c.heroSince}
        age={c.heroAge}
        roiTill={c.heroRoiTill}
        // `showRoi` can only HIDE it. Whether the reader may see service figures
        // at all is decided by their ERP token, never by a prop — otherwise
        // anyone with Studio access could reveal them.
        canSeeService={c.canSeeService && showRoi}
        stats={showRoi ? c.stats : []}
        clinics={showClinics ? c.clinics : []}
        clinicIndex={clinicIndex}
        onPickClinic={on.pickClinic}
        // Always handed down, so the button SHOWS before anything is wired to
        // it. The ERP clinic-creation flow comes later; until it does, pressing
        // it raises the event for whatever the page has bound and does nothing
        // otherwise.
        onAddClinic={showClinics ? () => onAddClinic?.(ident) : undefined}
        onOpenMap={() => on.openModal("map")}
        pharmacyCount={c.pharmacies.length}
        onOpenRx={() => on.openModal("rx")}
        onAddPob={showActions ? on.openPob : undefined}
        onAddNote={showActions ? on.noteOpen : undefined}
        onRequestService={showActions && onRequestService ? () => onRequestService(ident) : undefined}
      />

      {ui.modal === "map" ? (
        <MapModal
          clinics={c.clinics}
          index={clinicIndex}
          onPick={on.pickClinic}
          onClose={on.closeModal}
          // Same gate as the chip in the hero: the action exists only once the
          // page has wired a handler. It carries the doctor's identity so the
          // flow on the other side knows which Lead to attach the address to.
          onAdd={showClinics ? () => onAddClinic?.(ident) : undefined}
        />
      ) : null}

      {ui.modal === "rx" ? (
        <PharmacyModal
          rows={c.pharmacies}
          money={c.money}
          onAdd={onAddPharmacy ? () => onAddPharmacy(ident) : undefined}
          onClose={on.closeModal}
        />
      ) : null}

      {ui.modal === "note" ? (
        <NoteModal
          form={ui.noteForm}
          setForm={on.setNoteField}
          saving={ui.noteSaving}
          error={ui.noteError}
          onSave={on.saveNote}
          onClose={on.closeModal}
        />
      ) : null}

      {ui.pobOpen ? (
        <DoctorPobDialog
          open
          onOpenChange={on.setPobOpen}
          doctorId={c.doctorId}
          doctorName={c.doctor?.name}
          doctorHq={c.doctor?.hq}
          // The signed-in Employee, resolved from the token rather than bound.
          // Add POB defaults to them and narrows the dropdown to them plus
          // everyone under them.
          employee={c.viewer?.employee ?? null}
          erpUrl={props.erpUrl}
          authToken={props.authToken}
          onSaved={(payload) => { on.setPobOpen(false); on.refresh(); onPobSaved?.(payload); }}
        />
      ) : null}
    </CardShell>
  );
}
