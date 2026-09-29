"use client";

/**
 * Everything that can change what the doctor detail shows, in one place.
 *
 * Handed to `buildConsole`, so the objects it returns carry their own
 * callbacks — a section never has to know which slice of state a button
 * belongs to. Plain functions over `patch` (a state setter), so they work the
 * same whether the state lives in a React hook or anywhere else.
 */

import { PERIODS, parseDepartments } from "./console";

export function makeActions({ patch, getUi, getData, doctorId, refresh, writeNote, sample, panel }) {
  return {
    refresh: () => refresh(),

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
    resetFilter: () => patch({ divs: [], rangeMode: { mode: "cur", from: null, to: null }, sel: null, chartPage: 0 }),
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
    registerPanel: (node) => { panel.node = node; },

    /**
     * Open the timeline on one kind of row and bring it into view. The scroll
     * parent is walked for rather than assumed — the console sits inside an app
     * shell that scrolls its own pane, not the window.
     */
    jumpTo: (kind) => {
      patch({ view: "activity", kindFilter: kind });
      setTimeout(() => {
        const el = panel.node;
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
        patch({ noteForm: { body: "" }, modal: null, noteSaving: false, noteError: null });
        return;
      }
      patch({ noteSaving: true, noteError: null });
      try {
        const viewer = getData().viewer;
        await writeNote(doctorId(), {
          ...getUi().noteForm,
          // WHO, from the token and nothing else. `author` is the ERP User the
          // credential belongs to; `authorName`/`authorId` are the Employee
          // behind it, signed into the note text so the attribution survives a
          // page running on a shared credential. See `appendLeadNote`.
          author: viewer?.email,
          authorName: viewer?.employeeName ?? null,
          authorId: viewer?.employee ?? null,
        });
        patch({ noteForm: { body: "" }, modal: null, noteSaving: false });
        refresh();
      } catch (error) {
        patch({ noteSaving: false, noteError: error?.message ?? "Could not save the note." });
      }
    },
  };
}
