"use client";

/**
 * One shared reading of one doctor, for any number of separately-placed cards.
 *
 * The five doctor cards are ordinary top-level components — a page drops them
 * wherever it likes, in any order, with nothing wrapped around them. That is
 * the whole point, and it creates exactly one problem worth solving: five cards
 * must not mean five sets of ERP reads, and the filter on one of them must move
 * the numbers on the other four. Both are the same problem — the cards have to
 * share one reading and one set of choices.
 *
 * So the reading lives HERE, in a module-level store, not in a React tree. A
 * session is keyed by the doctor and the credential; whoever asks for that key
 * gets the same session. It fetches once, holds the filter state, runs
 * `buildConsole` whenever anything changes, and hands every subscriber the very
 * same snapshot. Two cards cannot disagree about what "this period" means
 * because there is only one answer to the question.
 *
 * A card with no doctor bound JOINS the session that another card created. That
 * is what makes the five usable in Studio: bind the doctor on one card — the
 * hero, normally — and the rest attach to it. Bind a different doctor on a card
 * and it gets its own session, which is how two doctors can sit side by side.
 *
 * SAMPLE MODE is the one session that never reads anything. `sampleData` on a
 * card hands the session a complete set of placeholder rows up front (see
 * `sampleData.js`) and `start()` returns without issuing a request, so the
 * design can be reviewed with no credential, no doctor and no network at all.
 * It is part of the session KEY, so a sample card and a live card on the same
 * page are two separate readings and neither can borrow the other's rows.
 */

import { emptyData, loadDoctorData, readDoctorInput } from "../DoctorDetail/lib/loadDoctor";
import { appendLeadNote } from "../DoctorDetail/lib/erp";
import { PERIODS, buildConsole, initialUi, parseDepartments } from "../DoctorDetail/lib/console";
import { sampleConsoleData } from "./sampleData";

/** Live sessions, newest last. Capped so a long-lived tab cannot grow forever. */
const SESSIONS = new Map();
const MAX_SESSIONS = 8;

/** Bumped whenever a session is created or destroyed, so joiners re-resolve. */
let registryVersion = 0;
const registryListeners = new Set();

/**
 * A session is created while a card is RENDERING, so the notice is deferred to
 * a microtask: telling other cards to re-render mid-render is the one thing
 * React will not forgive.
 */
function bumpRegistry() {
  registryVersion += 1;
  const fire = () => registryListeners.forEach((fn) => fn());
  if (typeof queueMicrotask === "function") queueMicrotask(fire); else setTimeout(fire, 0);
}

export function subscribeToRegistry(fn) {
  registryListeners.add(fn);
  return () => registryListeners.delete(fn);
}

export function getRegistryVersion() {
  return registryVersion;
}

/**
 * The identity of a reading. The credential is part of it on purpose: the same
 * doctor read with two different tokens is two different sets of rows, and
 * handing one reader the other reader's snapshot would quietly widen what they
 * can see.
 */
export function sessionKey({ doctorId, erpUrl, authToken, employee, roleProfile, pobLimit, sampleData }) {
  // JSON rather than a joined string: a token or an endpoint could contain any
  // separator we picked, and two different readings collapsing onto one key
  // would show one of them the other's rows.
  return JSON.stringify([
    doctorId ?? "",
    erpUrl ?? "",
    authToken ?? "",
    employee ?? "",
    roleProfile ?? "",
    pobLimit ?? 500,
    // Placeholder figures and real ones are two different readings of the same
    // doctor id, so they must never land on the same key.
    sampleData ? "sample" : "",
  ]);
}

function createSession(key, config) {
  const { bound, doctorId } = readDoctorInput(config.doctor);
  const sample = !!config.sampleData;

  const session = {
    key,
    doctorId,
    bound,
    config,
    sample,
    listeners: new Set(),
    refs: 0,
    generation: 0,
    started: false,
    // In sample mode the rows are in hand before the first render, so there is
    // no loading state to pass through and nothing to fetch afterwards.
    data: sample ? sampleConsoleData() : emptyData(doctorId, bound),
    ui: initialUi(config),
    snapshot: null,
    // The insights card registers its own DOM node here, so a totals card
    // placed anywhere on the page can still scroll the timeline into view.
    panelNode: null,
  };

  const notify = () => session.listeners.forEach((fn) => fn());

  const rebuild = () => {
    session.snapshot = buildConsole(session.data, session.ui, session.on);
    notify();
  };

  /** Replace part of the interaction state and redraw every card. */
  const patch = (next) => {
    const delta = typeof next === "function" ? next(session.ui) : next;
    if (!delta) return;
    session.ui = { ...session.ui, ...delta };
    rebuild();
  };
  session.patch = patch;

  session.setData = (data) => {
    session.data = data;
    rebuild();
  };

  /** Read ERP. Safe to call repeatedly — only the first call per generation runs. */
  session.start = () => {
    if (session.started) return;
    session.started = true;
    // SAMPLE MODE MAKES NO REQUEST. Not "a request whose result is thrown
    // away" — none at all, which is the whole point: the design has to be
    // reviewable on a page with no credential bound to it.
    if (sample) return;
    if (!session.doctorId) return;
    const generation = session.generation;
    const stale = () => session.generation !== generation;
    session.data = { ...session.data, loading: true };
    rebuild();
    loadDoctorData({ ...config, doctorId: session.doctorId, bound: session.bound }, stale)
      .then((data) => { if (data && !stale()) session.setData(data); })
      .catch((error) => {
        if (stale()) return;
        session.setData({
          ...emptyData(session.doctorId, session.bound),
          loading: false,
          fatal: error?.message ?? "Could not read this doctor from ERP.",
        });
      });
  };

  session.refresh = () => {
    session.generation += 1;
    session.started = false;
    session.start();
  };

  session.subscribe = (fn) => {
    session.listeners.add(fn);
    return () => session.listeners.delete(fn);
  };

  session.getSnapshot = () => session.snapshot;

  /* ----------------------------------------------------------- actions */

  // Everything that can change what the cards show, in one place. Handed to
  // `buildConsole` so the objects it returns carry their own callbacks — a card
  // never has to know which slice of state a button belongs to.
  session.on = {
    refresh: () => session.refresh(),

    // filter
    /**
     * Toggle one department in or out. "all" clears the list, which is how the
     * empty list — meaning every department — is spelled from the sheet.
     *
     * The chart pager resets because the pages it walks are the departments
     * still in play: leaving it where it was would land on a page that no
     * longer exists, or worse, on a different department than the one the
     * reader was looking at.
     */
    setDiv: (k) => patch((ui) => {
      if (!k || k === "all") return { divs: [], sel: null, chartPage: 0 };
      const divs = ui.divs.includes(k) ? ui.divs.filter((d) => d !== k) : [...ui.divs, k];
      return { divs, sel: null, chartPage: 0 };
    }),
    /** Replace the whole selection at once — what the `department` prop uses. */
    setDivs: (value) => patch({ divs: parseDepartments(value), sel: null, chartPage: 0 }),
    setRangeMode: (mode) => patch((ui) => ({
      rangeMode: { ...ui.rangeMode, mode: PERIODS.has(mode) ? mode : "fy" },
      sel: null,
    })),
    setNumShort: (v) => patch({ numShort: !!v }),
    resetFilter: () => patch({ divs: [], rangeMode: { mode: "fy", from: null, to: null }, sel: null, chartPage: 0 }),
    togglePicker: () => patch((ui) => ({ pickOpen: !ui.pickOpen, pickStage: "from" })),
    setPickYear: (y) => patch({ pickYear: y }),
    // Two taps: the first sets both ends, the second widens the range. Tapping
    // an earlier month second swaps the ends rather than producing a backwards
    // range that would match nothing.
    pickMonth: (key) => patch((ui) => {
      if (ui.pickStage === "from") {
        return { sel: null, pickStage: "to", rangeMode: { mode: "custom", from: key, to: key } };
      }
      let from = ui.rangeMode.from;
      let to = key;
      if (key < from) { from = key; to = ui.rangeMode.from; }
      return { sel: null, pickStage: "from", rangeMode: { mode: "custom", from, to } };
    }),

    // modals
    openModal: (name) => patch({ modal: name }),
    closeModal: () => patch({ modal: null }),
    openRole: (role) => patch({ roleOpen: role }),
    closeRole: () => patch({ roleOpen: null }),
    openSupportSplit: (entry) => patch({ supportSplit: entry }),
    closeSupportSplit: () => patch({ supportSplit: null }),
    openPob: () => patch({ pobOpen: true }),
    setPobOpen: (v) => patch({ pobOpen: !!v }),
    noteOpen: () => patch({ noteError: null, modal: "note" }),

    // chart + panels
    setChartPage: (fn) => patch((ui) => ({ chartPage: typeof fn === "function" ? fn(ui.chartPage) : fn, sel: null, hov: null })),
    setHidden: (k) => patch((ui) => ({ hidden: { ...ui.hidden, [k]: !ui.hidden[k] } })),
    hover: (i) => patch({ sel: i, hov: i }),
    leave: () => patch({ hov: null }),
    setView: (v) => patch({ view: v }),
    setKindFilter: (k) => patch({ kindFilter: k }),
    togglePivot: () => patch((ui) => ({ pivotOn: !ui.pivotOn, openRow: null, sortIdx: -1 })),
    toggleRow: (k) => patch((ui) => ({ openRow: ui.openRow === k ? null : k })),
    sort: (i) => patch((ui) => ({
      sortDir: ui.sortIdx === i && ui.sortDir === "desc" ? "asc" : "desc",
      sortIdx: i,
    })),

    // hero + totals
    setBannerIdx: (i) => patch({ bannerIdx: i }),
    pickClinic: (i) => patch({ clinicIdx: i }),

    /** The insights card tells the session where it is, so totals can scroll to it. */
    registerPanel: (node) => { session.panelNode = node; },

    /**
     * Open the timeline on one kind of row and bring it into view. The scroll
     * parent is walked for rather than assumed — the console sits inside an app
     * shell that scrolls its own pane, not the window.
     */
    jumpTo: (kind) => {
      patch({ view: "activity", kindFilter: kind });
      setTimeout(() => {
        const el = session.panelNode;
        if (!el) return;

        /*
         * An ancestor counts only if it ACTUALLY SCROLLS -- overflow-y first,
         * size second.
         *
         * Size alone is not enough and that is what broke this. A box with a
         * definite height and overflow visible has scrollHeight > clientHeight
         * too: its content simply spills out of it. The walk stopped at the
         * first such box, and scrollTo on an element that does not scroll is a
         * SILENT no-op -- the panel switched to the timeline and the page never
         * moved, with nothing in the console to say why. A Studio page stack
         * with a set height is exactly that box, which is the same shape that
         * once collapsed every card to zero height.
         */
        const scrolls = (node) => {
          if (!node || node === document.documentElement || node === document.body) return false;
          const overflowY = getComputedStyle(node).overflowY;
          return /auto|scroll|overlay/.test(overflowY) && node.scrollHeight > node.clientHeight + 4;
        };

        let p = el.parentElement;
        while (p && !scrolls(p)) p = p.parentElement;

        const top = el.getBoundingClientRect().top;
        if (p) {
          p.scrollTo({ top: p.scrollTop + top - p.getBoundingClientRect().top - 10, behavior: "smooth" });
        } else {
          // Nothing between here and the root scrolls its own pane, so the
          // document is what moves.
          window.scrollTo({ top: window.scrollY + top - 10, behavior: "smooth" });
        }
      }, 40);
    },

    // notes
    setNoteField: (key, value) => patch((ui) => ({ noteForm: { ...ui.noteForm, [key]: value } })),
    saveNote: async () => {
      // Sample mode writes nothing either. The composer still closes so the
      // dialog can be walked through, but there is no Lead behind these figures
      // and a design review has no business appending a note to ERP.
      if (sample) {
        patch({ noteForm: { subject: "", body: "", tag: "Note" }, modal: null, noteSaving: false, noteError: null });
        return;
      }
      patch({ noteSaving: true, noteError: null });
      try {
        await appendLeadNote(session.doctorId, {
          ...session.ui.noteForm,
          author: session.data.viewer?.email,
        });
        patch({ noteForm: { subject: "", body: "", tag: "Note" }, modal: null, noteSaving: false });
        session.refresh();
      } catch (error) {
        patch({ noteSaving: false, noteError: error?.message ?? "Could not save the note." });
      }
    },
  };

  session.snapshot = buildConsole(session.data, session.ui, session.on);
  return session;
}

/** Get the session for this key, creating it if nobody has asked yet. */
export function getSession(key, config) {
  const existing = SESSIONS.get(key);
  if (existing) {
    // Keep it newest-last so a joiner attaches to the one most recently used.
    SESSIONS.delete(key);
    SESSIONS.set(key, existing);
    return existing;
  }
  const session = createSession(key, config);
  SESSIONS.set(key, session);
  while (SESSIONS.size > MAX_SESSIONS) {
    const oldest = SESSIONS.keys().next().value;
    const victim = SESSIONS.get(oldest);
    if (victim?.refs > 0) break;
    SESSIONS.delete(oldest);
  }
  bumpRegistry();
  return session;
}

/**
 * The session a card with no doctor of its own should attach to: the most
 * recently used one that actually has a doctor. Null before any card has
 * created one, which is what the "bind a doctor" placeholder is for.
 */
export function latestSession() {
  let found = null;
  SESSIONS.forEach((s) => { if (s.doctorId) found = s; });
  return found;
}

/** Test/reset seam — drops every cached reading. */
export function clearSessions() {
  SESSIONS.clear();
  bumpRegistry();
}
