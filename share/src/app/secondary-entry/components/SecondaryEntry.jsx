'use client';

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Icon, SegmentedControl, Sheet, StatusPill, cx } from '@/design-system';
import { TableOperationsContext } from '@/app/datatable/contexts/TableOperationsContext';
import { useDataViews } from '@/app/datatable/contexts/ViewContext';
import { getEndpointConfigFromUrlKeyAsync } from '@/app/graphql-playground/constants';
import { coveringLabel, normalizeEntries, normalizeProducts, ownLines, toRowArray } from '../data/shape';
import { useServerEntries } from '../data/useServerEntries';
import { useServerTeam } from '../data/useServerTeam';
import { hasTeam } from '../data/team';
import {
  canSubmit,
  countByStatus,
  dominantMonth,
  filterByStatus,
  pendingForSeat,
  productOptions,
  progress,
  statusMatrix,
  submissionTotals,
} from '../data/selectors';
import { buildSheet } from '../data/csv';
import { XLSX_MIME, buildGridWorkbook, readSheetFile } from '../data/sheetFile';
import { ENTRY_SOURCE, createErpWriter, sheetBaseName } from '../data/writes';
import { SECONDARY, TaskProvider, partyCount } from '../data/task';
import { EntryOverview, EntryOverviewSkeleton } from './EntryOverview';
import { EntryForm } from './EntryForm';
import { AddPartySheet } from './AddPartySheet';
import { TeamProgress } from './TeamProgress';
import { useUnsavedGuard } from './useUnsavedGuard';

/* Secondary entry — a seat's month of stockist figures, and the form to key
 * them in. Drop it inside an Elbrit DataView under an Elbrit DataProvider
 * (Views) bound to the `SecondaryEntry` query; it reads the rows from the
 * provider's context, so nothing needs binding. `rows` overrides that for
 * use outside a provider.
 *
 * WHICH STOCKISTS: every entry the query returns — the ERP's permission
 * rules decide which, nothing here narrows them.
 *
 * WHICH LINES: one ERP entry is shared by several seats, so every status,
 * total and write is for ONE seat (`roleProfile`) — this screen's job, as
 * the ERP's permissions are per document, not per line. Unset, the seat is
 * the ERP's answer for the signed-in user (their Employee's custom_role_profile).
 *
 * Writes go straight to ERP as the signed-in user (`gqlToken`, required to
 * save). See data/writes.js for why that is a REST get → save round-trip. */

function downloadText(filename, text) {
  downloadBlob(filename, new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' }));
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function useProviderSlot() {
  const ctx = useContext(TableOperationsContext);
  if (!ctx || typeof ctx !== 'object') return null;
  return ctx.rawData !== undefined ? ctx : (ctx.main ?? null);
}

export function SecondaryEntry({
  rows: rowsProp,
  roleProfile: roleProfileProp,
  month: monthProp,
  gqlEnvironment = 'ERP',
  gqlToken,
  productsQueryId = 'Items',
  products: productsProp,
  /* Which task this screen is for (data/task.js) — Secondary by default;
     DoctorSupportEntry passes Doctor Support. */
  task = SECONDARY,
  title,
  onBack,
  onSaved,
  /* Gap under the pinned bars (bulk send on the list, save / submit on a
     stockist); e.g. calc(4rem + var(--space-12)) to clear an app's bottom
     navigation. */
  bottomGap,
  writer: writerProp,
  className,
}) {
  const slot = useProviderSlot();
  /* WHERE THE ROWS COME FROM: `rows`, else the Elbrit DataProvider it sits
     in, else — the usual case — the "Elbrit Secondary Entry" server script
     as the signed-in user (data/useServerEntries.js): every entry they may
     see, no cap, only their seat's lines. */
  const serverMode = rowsProp == null && !slot && Boolean(gqlToken?.trim());
  /* THE TEAM: a manager (anyone with people under them, and IT) also sees
     their team's month as a tree (TeamProgress), and can open any member's
     entries — read-only (`viewing`), their own seat staying editable. */
  const team = useServerTeam({ enabled: serverMode && !roleProfileProp, gqlEnvironment, gqlToken, month: monthProp, task: task.id });
  const withTeam = hasTeam(team.data);
  const [viewing, setViewing] = useState(null);
  const [pane, setPane] = useState(null);
  const server = useServerEntries({
    enabled: serverMode,
    gqlEnvironment,
    gqlToken,
    month: monthProp,
    seat: roleProfileProp || viewing?.seat,
    method: task.entryMethod,
    /* The caller's own view also lists the vacant seats they cover. */
    withCovers: !roleProfileProp && !viewing,
  });
  const sourceRows = useMemo(
    () => toRowArray(rowsProp ?? slot?.rawData ?? server.data?.entries),
    [rowsProp, slot?.rawData, server.data],
  );

  /* Saved docs, keyed by name, laid over the provider's rows until its next
     fetch brings them back — so a save shows at once instead of after a
     refetch. Dropped whenever fresh rows arrive. */
  const [patches, setPatches] = useState(() => new Map());
  useEffect(() => setPatches(new Map()), [sourceRows]);
  const rows = useMemo(
    () => (patches.size ? sourceRows.map((r) => patches.get(r.name) ?? r) : sourceRows),
    [sourceRows, patches],
  );

  /* The seat: the prop, else asked of the ERP once the writer exists (below). */
  const [erpSeat, setErpSeat] = useState({ seat: null, asked: false, error: null });
  const [seatAttempt, setSeatAttempt] = useState(0);
  const roleProfile = roleProfileProp || (serverMode ? server.data?.seat : erpSeat.seat) || null;
  /* COVERING A VACANT SEAT. A seat whose every holder is a "Vacant_"
     placeholder is entered by the nearest live manager above it (the ERP
     routes its lines on from there, and lets a manager enter them). The
     server script says which vacant seats the caller covers (`covers`), and
     whether the seat open now is one (`covering`) — that one opens
     editable, saving as the vacant seat, where any other team seat is
     read-only. */
  const covers = server.data?.covers ?? [];
  const coveringNow = Boolean(viewing && server.data?.covering && server.data?.seat === viewing.seat);
  /* SERVER PAGING, when the parent Elbrit DataProvider (Views) has
     enableServerPaging on. Paging there grows the query's `first` limit and
     re-queries — not a cursor: `after` + a `filter` throws on our ERP (see
     ViewPaginator) — so every load brings rows 1..N and none can be skipped.
     A full page back is the only "more may exist" signal the pipeline has.
     The list keeps the server's order under paging (see normalizeEntries). */
  const paging = useDataViews()?.paging;
  const serverPaged = Boolean(paging?.enabled && typeof paging.loadMore === 'function');
  const hasMore = serverPaged && sourceRows.length >= paging.fetchSize;
  const entries = useMemo(
    /* No seat, nothing to show: the server's answer always comes with one.
       What the server script sends is shown as it is; a saved query or the
       mock hands over whole records, trimmed here to the seat's lines. */
    () => (roleProfile ? normalizeEntries(serverMode ? rows : ownLines(rows, roleProfile), roleProfile, { sort: !serverPaged }) : []),
    [rows, roleProfile, serverMode, serverPaged],
  );
  /* For saveEntry: which record and seat a row saves to, without rebuilding
     the callback on every change. */
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const [queriedProducts, setQueriedProducts] = useState([]);
  const queryFunction = slot?.queryFunction;
  useEffect(() => {
    if (productsProp || !productsQueryId || typeof queryFunction !== 'function') return undefined;
    let cancelled = false;
    queryFunction(productsQueryId)
      .then((result) => {
        if (!cancelled) setQueriedProducts(normalizeProducts(result));
      })
      .catch((e) => console.warn(`[secondary-entry] "${productsQueryId}" query failed:`, e?.message ?? e));
    return () => {
      cancelled = true;
    };
    // queryFunction's identity changes with the provider's filters; one load is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsQueryId, productsProp, typeof queryFunction === 'function']);
  const products = useMemo(
    () =>
      productOptions(
        productsProp ? normalizeProducts(productsProp) : serverMode ? normalizeProducts(server.data?.products ?? []) : queriedProducts,
        entries,
      ),
    [productsProp, serverMode, server.data, queriedProducts, entries],
  );

  const month = dominantMonth(entries);
  const counts = countByStatus(entries);
  const prog = progress(entries);
  const matrix = statusMatrix(entries);
  const pending = pendingForSeat(entries);

  const [filter, setFilter] = useState('draft');
  const [openName, setOpenName] = useState(null);
  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(null);
  const flash = useCallback((text) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const writerRef = useRef(null);
  const getWriter = useCallback(async () => {
    if (writerProp) return writerProp;
    if (writerRef.current?.token === gqlToken && writerRef.current?.env === gqlEnvironment) return writerRef.current.writer;
    const { endpointUrl } = await getEndpointConfigFromUrlKeyAsync(gqlEnvironment);
    const writer = createErpWriter({ endpointUrl, gqlToken, task });
    writerRef.current = { writer, token: gqlToken, env: gqlEnvironment };
    return writer;
  }, [writerProp, gqlToken, gqlEnvironment, task]);

  const signedIn = Boolean(writerProp) || Boolean(gqlToken?.trim());
  useEffect(() => {
    /* From the server script the seat comes with the rows. */
    if (roleProfileProp || !signedIn || serverMode) return undefined;
    let stale = false;
    setErpSeat({ seat: null, asked: false, error: null });
    (async () => {
      try {
        const writer = await getWriter();
        const { seat } = await writer.whoAmI();
        if (!stale) setErpSeat({ seat, asked: true, error: null });
      } catch (e) {
        console.warn('[secondary-entry] could not ask ERP for the seat:', e?.message ?? e);
        if (!stale) setErpSeat({ seat: null, asked: true, error: e?.message || 'ERP did not answer.' });
      }
    })();
    return () => {
      stale = true;
    };
  }, [roleProfileProp, signedIn, getWriter, seatAttempt, serverMode]);

  /* Without a seat nothing is shown — an error says why, never the whole
     entry in its place. */
  const asked = serverMode ? Boolean(server.data || server.error) : erpSeat.asked;
  const askError = serverMode ? (server.data ? null : server.error?.message) : erpSeat.error;
  const seatProblem = roleProfile
    ? null
    : !signedIn
      ? { title: 'Not signed in to ERP', text: `Bind gqlToken (the signed-in user's ERP token) to load your ${task.parties}.`, retry: false }
      : !asked
        ? 'finding'
        : askError
          ? { title: 'Something went wrong', text: `Could not load your ${task.parties} from ERP: ${askError}`, retry: true }
          : { title: 'No seat for this user', text: 'ERP has no active Employee with a role profile for this user, so there are no lines to enter. Ask for your Employee record to be set up.', retry: true };

  /* The server says when what it sent is not this user's to save (IT's view
     of every seat). */
  const serverReadOnly = serverMode && Boolean(server.data?.read_only);
  const canEdit = Boolean(roleProfile) && signedIn && !serverReadOnly && (!viewing || coveringNow);
  const readOnlyReason = viewing && !coveringNow
    ? `Viewing ${viewing.name}'s ${task.parties} — read only.`
    : serverReadOnly
    ? 'Read only.'
    : !roleProfile
    ? signedIn && !asked
      ? 'Finding your seat in ERP…'
      : 'No active Employee seat for this user in ERP — nothing can be entered.'
    : !canEdit
      ? "Read-only: bind gqlToken (the signed-in user's ERP token) to save."
      : null;

  /* Live writes also refetch, so derived server fields (totals, the tracker
     row) come from ERP rather than from our patch. A bulk run passes
     `sync: false` per entry and refetches ONCE at the end — a refetch per
     entry would re-query the whole month N times and wipe the patches the
     loop is laying down as it goes. */
  const refetch = useCallback(async () => {
    const writer = await getWriter();
    if (writer.live === false) return;
    if (slot) slot.handleSync?.();
    else if (serverMode) server.reload();
  }, [getWriter, slot, serverMode, server]);

  const saveEntry = useCallback(
    async (name, { lines, submit }, { sync = true } = {}) => {
      const writer = await getWriter();
      /* A covered vacant seat's row saves to its real record, as that seat. */
      const entry = entriesRef.current.find((e) => e.name === name);
      const saved = await writer.saveSeat(entry?.docName ?? name, { roleProfile: entry?.seat ?? roleProfile, lines, submit });
      if (saved && typeof saved === 'object') {
        /* A save's reply is the whole record — every seat's lines; laid
           over the list as the seat's own, as the server script sends it. */
        const own = ownLines([saved], entry?.seat ?? roleProfile)[0];
        const patch = entry?.covering ? { ...own, name, docName: entry.docName, covering: entry.covering } : own;
        setPatches((prev) => new Map(prev).set(name, patch));
      }
      onSaved?.({ name, submit, live: writer.live !== false });
      if (sync && writer.live !== false) {
        if (slot) slot.handleSync?.();
        else if (serverMode) server.reload();
      }
      return saved;
    },
    [getWriter, roleProfile, onSaved, slot, serverMode, server],
  );

  /* ---- bulk send for approval ------------------------------------------
     Select mode on the list: pick stockists, send them all. Each is the same
     Submit a single entry does — its own lines, as they stand, marked
     Submitted — one after another, so one failure (a timestamp clash, a
     permission) is reported against its stockist and the rest still go. */
  const [selected, setSelected] = useState(() => new Set());
  const [sendingBulk, setSendingBulk] = useState(false);
  const [sendError, setSendError] = useState(null);
  const eligible = useMemo(() => entries.filter(canSubmit), [entries]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setSendError(null);
  }, []);

  /* Drop picks that stopped being sendable (a refetch moved them on). */
  useEffect(() => {
    if (!selected.size) return;
    const ok = new Set(eligible.map((e) => e.name));
    if ([...selected].some((n) => !ok.has(n))) setSelected((prev) => new Set([...prev].filter((n) => ok.has(n))));
  }, [eligible, selected]);

  const sendSelected = useCallback(async () => {
    const toSend = entries.filter((e) => selected.has(e.name) && canSubmit(e));
    if (!toSend.length) return;
    setSendingBulk(true);
    setSendError(null);
    const failed = [];
    let sent = 0;
    for (const e of toSend) {
      try {
        await saveEntry(
          e.name,
          {
            submit: true,
            lines: e.lines.map((l) => ({ item: l.item, price: l.price, salesQty: l.salesQty, closingQty: l.closingQty })),
          },
          { sync: false },
        );
        sent += 1;
      } catch (err) {
        failed.push(`${e.stockist}: ${err?.message ?? err}`);
      }
    }
    setSendingBulk(false);
    if (sent) await refetch();
    if (failed.length) {
      /* Shown in the send bar, which stays open — right where the retry is. */
      setSendError([`Sent ${sent} of ${toSend.length}.`, ...failed.slice(0, 3)].join(' '));
      /* Keep the failures picked, so a retry is one tap. */
      setSelected(new Set(toSend.filter((e) => failed.some((f) => f.startsWith(`${e.stockist}:`))).map((e) => e.name)));
    } else {
      clearSelection();
      flash(`${partyCount(task, sent)} sent for approval.`);
    }
  }, [entries, selected, saveEntry, refetch, clearSelection, flash, task]);

  const selection = canEdit
    ? {
        selected,
        /* What the picked ones add up to, for the send confirmation. */
        summary: submissionTotals(entries.filter((e) => selected.has(e.name))),
        busy: sendingBulk,
        error: sendError,
        onCancel: clearSelection,
        onToggle: (name) =>
          setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
          }),
        onSelect: (names, mode) =>
          setSelected((prev) => {
            const next = new Set(prev);
            for (const n of names) {
              if (mode === 'remove') next.delete(n);
              else next.add(n);
            }
            return next;
          }),
        onSend: sendSelected,
      }
    : null;

  /* ---- "Add doctor" / "Add stockist" (task.addMethod) ---------------------
     The seat's own parties not on its list (the server's `addable`, own
     view only, and only for the PREVIOUS month — the one the add script
     creates for; any other month sends null, so no button). Doctor Support
     (task.addCovers) also offers it on a vacant seat being covered, adding
     for that seat. Create puts the seat's lines — every product
     at 0 — on each, then the month is re-read so they show, and go into the
     downloaded sheet, like any other. */
  const addable = server.data?.addable;
  const addingFor = coveringNow && task.addCovers ? viewing.seat : null;
  const canAdd = Boolean(task.addMethod) && serverMode && canEdit && (!viewing || Boolean(addingFor)) && Array.isArray(addable);
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(null);
  const createParties = useCallback(
    async (names) => {
      setAdding(true);
      setAddError(null);
      try {
        const writer = await getWriter();
        /* A covered seat's party comes as "<party>::<seat>" (My entries
           offers them beside the caller's own): one call per seat. */
        const bySeat = new Map();
        for (const n of names) {
          const at = n.indexOf('::');
          const seat = at < 0 ? addingFor : n.slice(at + 2);
          if (!bySeat.has(seat)) bySeat.set(seat, []);
          bySeat.get(seat).push(at < 0 ? n : n.slice(0, at));
        }
        const res = { created: [], added: [], skipped: [] };
        for (const [seat, parties] of bySeat) {
          const one = (await writer.addParties({ parties, seat })) ?? {};
          res.created.push(...(one.created ?? []));
          res.added.push(...(one.added ?? []));
          res.skipped.push(...(one.skipped ?? []));
        }
        const done = res.created.length + res.added.length;
        const skipped = res.skipped;
        if (!done) {
          setAddError(skipped.length ? `Nothing added: ${skipped.map((s) => `${s.doctor} (${s.reason})`).slice(0, 3).join(', ')}.` : 'Nothing added.');
          return;
        }
        setAddOpen(false);
        flash(
          [`${partyCount(task, done)} added to your list.`, skipped.length ? `${skipped.length} not added: ${skipped.map((s) => s.doctor).slice(0, 3).join(', ')}.` : null]
            .filter(Boolean)
            .join(' '),
        );
        server.reload();
      } catch (e) {
        setAddError(e?.message || 'ERP did not answer. Please try again.');
      } finally {
        setAdding(false);
      }
    },
    [getWriter, server, flash, task, addingFor],
  );

  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState(null);
  const sheetRows = useMemo(
    () => pending.reduce((n, e) => n + (e.lines.length || products.length), 0),
    [pending, products],
  );

  const [downloaded, setDownloaded] = useState(false);
  /* The sheet's layout: one row per stockist × product, or products down
     and stockists across (data/csv.js). The upload reads either. */
  const [sheetLayout, setSheetLayout] = useState('grid');
  const onDownload = async () => {
    const grid = sheetLayout === 'grid';
    const stem = `${task.fileStem}-${month ?? 'period'}`;
    if (grid) {
      /* An .xlsx: each stockist's name merged over its Sales and Closing. */
      downloadBlob(`${stem}-grid.xlsx`, new Blob([await buildGridWorkbook(pending, products, task)], { type: XLSX_MIME }));
    } else {
      downloadText(`${stem}.csv`, buildSheet(pending, products, task));
    }
    setDownloaded(true);
    setBulkMessage({
      tone: 'neutral',
      text: grid
        ? `Fill each ${task.party}'s ${task.closing ? 'Sales and Closing columns' : 'column'}, keep the header row as it is, then re-upload.`
        : task.closing
          ? 'Fill Sales Qty and Closing Qty, keep the Entry column, then re-upload.'
          : 'Fill Qty, keep the Entry column, then re-upload.',
    });
  };

  const onUpload = async (file) => {
    if (!canEdit) {
      setBulkMessage({ tone: 'danger', text: readOnlyReason });
      return;
    }
    setBulkBusy(true);
    setBulkMessage(null);
    try {
      /* Any format back — the download is CSV, but Excel re-saves as .xlsx. */
      const { byEntry, errors } = await readSheetFile(file, task);
      const pendingByName = new Map(pending.map((e) => [e.name, e]));
      const priceOf = new Map(products.map((p) => [p.item, p.price]));
      let filled = 0;
      let resubmitted = 0;
      /* Kept apart, each said in one plain line below: already sent for
         approval (not changed), and could not be saved. */
      const skipped = [];
      const notSaved = [];
      const partyName = (name) => entries.find((e) => e.name === name)?.stockist || String(name).replace(/-\d{4}-\d{2}-\d{2}$/, '');
      /* What the sheet fills, before anything is written. */
      const plan = [];
      for (const [name, sheetLines] of byEntry) {
        const entry = pendingByName.get(name);
        if (!entry) {
          skipped.push(partyName(name));
          continue;
        }
        const own = new Map(entry.lines.map((l) => [l.item, l.price]));
        const lines = sheetLines.map((l) => ({ ...l, price: own.get(l.item) || priceOf.get(l.item) || 0, source: ENTRY_SOURCE.upload }));
        plan.push({ name, entry, lines });
      }
      /* THE SHEET FIRST: kept in Transformed Data on every record it fills,
         and only then the figures — so figures from a sheet never stand in
         ERP without the sheet. If ERP will not take the file (after
         attachSheet's own retries), nothing is filled. */
      if (plan.length) {
        try {
          await (await getWriter()).attachSheet?.(
            file,
            plan.map((p) => ({
              name: p.entry.docName ?? p.name,
              /* "<seat>-<stockist / doctor>-<month>", numbered by ERP on a repeat */
              base: sheetBaseName({ seat: p.entry.seat ?? roleProfile, party: p.entry.stockist || p.entry.ebsCode, month: p.entry.month }),
            })),
          );
        } catch (e) {
          console.warn('[secondary-entry] the uploaded file was not kept:', e?.message ?? e);
          setBulkMessage({ tone: 'danger', text: 'Upload failed — nothing was saved. Please try again.' });
          return;
        }
      }
      for (const { name, entry, lines } of plan) {
        /* A stockist sent back for revisit still has its approval open and
           waiting; saving it as a draft would put Draft lines behind that
           approval (found on UAT). So a revisit is resubmitted, as its own
           page's only button does. */
        const revisit = entry.status === 'revisit';
        try {
          await saveEntry(name, { lines, submit: revisit }, { sync: false });
          if (revisit) resubmitted += 1;
          else filled += 1;
        } catch (e) {
          console.warn(`[secondary-entry] ${entry.stockist} not saved:`, e?.message ?? e);
          notSaved.push(entry.stockist);
        }
      }
      /* Short and plain, for the person in the field: what was saved, what
         was not and why, what to do next — no workflow words. */
      const few = (names) => (names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(', '));
      setBulkMessage({
        tone: notSaved.length || errors.length || (!filled && !resubmitted && !skipped.length) ? 'danger' : 'neutral',
        text: [
          filled ? `${partyCount(task, filled)} saved — open and tap Submit.` : null,
          resubmitted ? `${partyCount(task, resubmitted)} corrected and sent for approval.` : null,
          skipped.length ? `Not changed, already sent for approval: ${few(skipped)}.` : null,
          notSaved.length ? `Could not save ${few(notSaved)} — please try again.` : null,
          errors.length ? `${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1} more)` : ''}` : null,
          !filled && !resubmitted && !skipped.length && !notSaved.length && !errors.length ? 'Nothing to save in this file.' : null,
        ].filter(Boolean).join(' '),
      });
      if (filled || resubmitted) {
        setFilter('draft');
        await refetch();
      }
    } finally {
      setBulkBusy(false);
    }
  };

  const openEntry = openName ? entries.find((e) => e.name === openName) : null;
  /* A manager with nothing of their own to enter lands on the team. A seat
     opened from the team (`viewing`) is always shown as its own list: it is
     reached from the Team pane, and the Team pane would hide its "Add
     doctor" on a covered vacant seat. */
  const shownPane = viewing ? 'mine' : pane ?? (withTeam && !entries.length ? 'team' : 'mine');
  /* Whose entries changed: nothing of the last person's stays open. */
  useEffect(() => setOpenName(null), [viewing]);
  const loading = slot?.isLoading && !rows.length;

  /* Page-state navigation keeps the reader's place both ways: opening starts
     the stockist page at its top, and going back lands on the card they came
     from rather than at the top of a 20-card list. */
  const rootRef = useRef(null);
  const returnTo = useRef(null);
  const openStockist = useCallback((name) => {
    returnTo.current = name;
    setOpenName(name);
  }, []);
  /* `leaveEntry` closes the stockist page unconditionally (after a save);
     `closeEntry` is the guarded way out every control uses. */
  const leaveEntry = useCallback(() => setOpenName(null), []);

  /* UNSAVED CHANGES, for Secondary Entry as a whole — the same mechanism as
     Navigation's exit confirmation, and the same Sheet. Only the open
     stockist's form can be dirty. A back press with changes discards them
     and returns to the list: back is one level up, not out of the screen. */
  const [dirty, setDirty] = useState(false);
  const guard = useUnsavedGuard({ dirty: dirty && openName != null, onBack: leaveEntry });
  const closeEntry = useCallback(() => guard.request(leaveEntry), [guard, leaveEntry]);
  /* The header arrow on a stockist page goes up to the list; on the list it
     leaves the screen through the page's own onBack. Guarded either way. */
  const onHeaderBack = openName != null ? closeEntry : onBack ? () => guard.request(onBack) : null;

  useEffect(() => {
    if (openName) {
      rootRef.current?.scrollIntoView({ block: 'start' });
      return;
    }
    const name = returnTo.current;
    if (!name) return;
    returnTo.current = null;
    const card = rootRef.current?.querySelector(`[data-entry="${CSS.escape(name)}"]`);
    card?.scrollIntoView({ block: 'center' });
    card?.focus({ preventScroll: true });
  }, [openName]);

  return (
    <TaskProvider value={task}>
    <section ref={rootRef} className={cx('@container/entry flex w-full scroll-mt-3 flex-col gap-3 @2xl/entry:gap-4', className)}>
      <header className="flex items-center gap-2">
        {onHeaderBack ? (
          <button
            type="button"
            onClick={onHeaderBack}
            aria-label={openName != null ? `Back to all ${task.parties}` : 'Back'}
            /* Just the chevron, flush with the content edge — no box around
               it. Feedback is the glyph's colour: lighter on hover, the
               brand on press. */
            className="flex shrink-0 items-center text-heading transition-colors hover:text-brand-hover active:text-brand"
          >
            <Icon name="chevron-left" />
          </button>
        ) : null}
        <h1 className="min-w-0 flex-1 truncate text-16 font-semibold text-heading @2xl/entry:text-20">{title ?? task.entryTitle}</h1>
        {prog.total && !prog.remaining ? (
          <StatusPill status="success" className="shrink-0">
            All entered
          </StatusPill>
        ) : null}
      </header>

      {covers.length && !viewing && !openEntry ? (
        <p className="rounded-lg bg-warning-wash px-3 py-2 text-12 text-warning-text">
          <span className="font-semibold">
            You also cover {covers.length} vacant {covers.length === 1 ? 'seat' : 'seats'}:
          </span>{' '}
          {covers.map((c) => coveringLabel(c).replace(/^Covering Vacant - /, '')).join(', ')}. Their {task.parties} are below, marked
          &ldquo;Covering Vacant&rdquo;; what you submit for them goes to your manager to approve.
        </p>
      ) : null}

      {withTeam && !viewing && !openEntry ? (
        <SegmentedControl
          block
          ariaLabel="Whose entries"
          value={shownPane}
          onChange={setPane}
          items={[
            { id: 'mine', label: 'My entries' },
            { id: 'team', label: 'Team' },
          ]}
        />
      ) : null}

      {viewing && !openEntry ? (
        <div className={cx('flex items-center gap-2 rounded-lg px-3 py-2', coveringNow ? 'bg-warning-wash' : 'bg-brand-tint-weak')}>
          <button
            type="button"
            onClick={() => setViewing(null)}
            aria-label="Back to the team"
            className={cx('flex shrink-0 items-center transition-colors', coveringNow ? 'text-warning-text' : 'text-brand-text hover:text-brand-hover')}
          >
            <Icon name="chevron-left" size="sm" />
          </button>
          {coveringNow ? (
            <span className="min-w-0 flex-1 truncate text-12 text-warning-text">
              <span className="font-semibold">{coveringLabel(covers.find((c) => c.seat === viewing.seat) ?? { seat: viewing.seat })}</span> · you are entering for it
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate text-12 text-brand-text">
              <span className="font-semibold">{viewing.name}</span> · {viewing.seat} · read only
            </span>
          )}
        </div>
      ) : null}

      {canAdd && shownPane === 'mine' && !openEntry ? (
        <Button
          type="dashed"
          size="lg"
          block
          icon={<Icon name="plus" size="sm" />}
          disabled={!addable.length}
          title={addable.length ? undefined : `Every one of your ${task.parties} is already on your list.`}
          onClick={() => {
            setAddError(null);
            setAddOpen(true);
          }}
        >
          Add {task.party}
          {addable.length ? ` (${addable.length} not on your list)` : ''}
        </Button>
      ) : null}

      {shownPane === 'team' && !viewing && !openEntry ? (
        <TeamProgress team={team.data} covers={covers} onView={(m) => setViewing({ seat: m.seat, name: m.name })} />
      ) : loading || seatProblem === 'finding' ? (
        <EntryOverviewSkeleton />
      ) : seatProblem ? (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-xl bg-danger-wash px-4 py-4">
          <span className="flex items-center gap-2 text-13 font-semibold text-danger-text">
            <Icon name="exclamation-triangle" size="sm" />
            {seatProblem.title}
          </span>
          <p className="text-12 text-ds-secondary">{seatProblem.text}</p>
          {seatProblem.retry ? (
            <Button type="default" size="app" onClick={() => (serverMode ? server.reload() : setSeatAttempt((n) => n + 1))}>
              Try again
            </Button>
          ) : null}
        </div>
      ) : !entries.length ? (
        <p className="py-10 text-center text-12 text-ds-muted">No {task.Party.toLowerCase()} entries for this period.</p>
      ) : openEntry ? (
        /* A dedicated page state, not an overlay: the stockist replaces the
           list, and back returns to it with the opened card in view. */
        <EntryForm
          key={openEntry.name}
          entry={openEntry}
          products={products}
          canEdit={canEdit}
          readOnlyReason={readOnlyReason}
          onBack={closeEntry}
          onDirtyChange={setDirty}
          bottomGap={bottomGap}
          onSave={async ({ lines, submit }) => {
            await saveEntry(openEntry.name, { lines, submit });
            flash(submit ? `${openEntry.stockist} sent for approval.` : `${openEntry.stockist} saved as draft.`);
            /* Saved, so nothing to lose: close without asking. */
            setDirty(false);
            leaveEntry();
          }}
        />
      ) : (
        <EntryOverview
          counts={counts}
          entered={prog.entered}
          matrix={matrix}
          entries={filterByStatus(entries, filter)}
          filter={filter}
          onFilterChange={setFilter}
          onOpen={openStockist}
          notice={notice}
          selection={selection}
          selectionBarGap={bottomGap}
          infinite={
            serverPaged
              ? { hasMore, loading: Boolean(slot?.isLoading), loaded: sourceRows.length, onReachEnd: paging.loadMore }
              : null
          }
          bulk={
            viewing && !coveringNow ? null : (
            <EntryOverview.BulkEntryCard
              pendingCount={pending.length}
              sheetRows={sheetRows}
              downloaded={downloaded}
              layout={sheetLayout}
              onLayoutChange={setSheetLayout}
              onDownload={onDownload}
              onUpload={onUpload}
              busy={bulkBusy}
              message={bulkMessage}
            />
            )
          }
        />
      )}

      {canAdd ? (
        <AddPartySheet
          open={addOpen}
          onClose={() => setAddOpen(false)}
          parties={addable}
          limit={task.addLimit}
          busy={adding}
          error={addError}
          onCreate={createParties}
        />
      ) : null}

      {/* Unsaved-changes confirmation — the same Sheet Navigation's exit
          confirmation uses, laid out the same way. */}
      <Sheet open={guard.confirmOpen} onClose={guard.cancel} title="Discard changes?" surface="app">
        <p className="text-sm text-ds-secondary">
          {openEntry
            ? `Your changes to ${openEntry.stockist} are not saved. Leave without saving them?`
            : 'Your changes are not saved. Leave without saving them?'}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="default" size="app" onClick={guard.cancel}>
            Keep editing
          </Button>
          <Button type="primary" size="app" danger onClick={guard.confirm}>
            Discard
          </Button>
        </div>
      </Sheet>
    </section>
    </TaskProvider>
  );
}

export default SecondaryEntry;
