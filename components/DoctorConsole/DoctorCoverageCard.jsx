"use client";

/**
 * Doctor · Coverage by role — the BE / ABM / RBM / ZSM rings.
 *
 * Who has actually touched this doctor in the selected period, each ring
 * openable for the per-department split. The counts answer to the filter bar
 * like everything else, so "no touch in this period" always means the period
 * the rest of the page is showing.
 */

import React from "react";

import Coverage from "../DoctorDetail/ui/Coverage";
import { RoleDetailModal } from "../DoctorDetail/ui/Modals";
import { CardShell, Unbound, useContainerMode } from "./shell";
import useDoctorConsole from "./useDoctorConsole";

export default function DoctorCoverageCard(props) {
  const { openable = true, className, style } = props;

  const c = useDoctorConsole(props);
  const [ref, compact] = useContainerMode(720);

  if (!c) return <Unbound what="The doctor coverage card" innerRef={ref} className={className} style={style} />;

  const rows = openable ? c.coverageRows : c.coverageRows.map((r) => ({ ...r, open: undefined }));

  return (
    <CardShell innerRef={ref} compact={compact} className={className} style={style}>
      <Coverage rows={rows} note={c.coverageNote} />

      {c.roleDetail ? (
        <RoleDetailModal detail={c.roleDetail} compact={compact} onClose={c.on.closeRole} />
      ) : null}
    </CardShell>
  );
}
