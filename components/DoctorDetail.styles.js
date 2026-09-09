// Scoped styles render with the component, including server-rendered previews.
//
// DESIGN NOTE — this is a STATEMENT OF ACCOUNT, not a dashboard.
//
// The material this component is made of is document numbers: DR-36661,
// SAL-QTN-2026-00040, BE11-VASC-CO-TRI, ₹ figures in lakh grouping, strips as a
// unit of measure. Statements of that kind are ruled and monospaced, so the
// structure here is hairlines and small-caps eyebrows rather than a grid of
// identical cards — nine boxes with the same border, radius and shadow flattened
// the hierarchy until "Record" weighed as much as the POB summary.
//
// Boldness is spent in exactly one place: the balance block, where the total POB
// is set large in monospace with an inline sparkline on the same baseline, the
// way a closing balance reads. Everything around it stays quiet.
//
// Figures use a system monospace stack, not a web font: this component is
// embedded in someone else's page and must not depend on a font host or flash
// while one loads.
const doctorDetailStyles = `
.dtx-root {
  /* Warm, red-biased neutrals, so they belong to the Elbrit red instead of
     sitting beside it as a borrowed cool grey. */
  --dtx-ink:#1a1614; --dtx-ink-2:#4a3e3a; --dtx-mute:#8a7a75; --dtx-faint:#a89893;
  --dtx-line:#e5dcd9; --dtx-line-soft:#f1eae8; --dtx-card:#fff; --dtx-ground:#f5f1f0;
  --dtx-good:#17724a; --dtx-good-soft:#e8f3ec;
  --dtx-warn:#8f5a0c; --dtx-warn-soft:#fbf3e7;
  --dtx-void:#6b5b58; --dtx-void-soft:#f0eae9;
  --dtx-mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;

  box-sizing:border-box; width:100%; max-width:100%; min-width:0;
  display:flex; flex-direction:column; min-height:0;
  font-family:var(--dtx-font,system-ui,-apple-system,"Segoe UI",sans-serif);
  font-size:14px; line-height:1.5; color:var(--dtx-ink); background:#fff;
  border:1px solid var(--dtx-line); border-radius:14px; overflow:hidden;
  -webkit-font-smoothing:antialiased;
}

/* This is a COMPONENT inside a page's layout stack, not a page. The root is a
   flex column with min-height:0 so a parent can squeeze it, and all scrolling
   happens on the port below: at auto height the port is exactly as tall as its
   content and shows no scrollbar, at a constrained height it becomes the
   scroller instead of the component clipping. Nothing is sized in vw/vh —
   everything responsive keys off the measured container via .dtx-root--compact. */
.dtx-scrollport {
  flex:1 1 auto; min-height:0; min-width:0;
  overflow-y:auto; overflow-x:hidden;
  overscroll-behavior:contain; scrollbar-gutter:stable;
}

.dtx-root *, .dtx-root *::before, .dtx-root *::after {box-sizing:border-box}
.dtx-root h1,.dtx-root h2,.dtx-root h3,.dtx-root p,.dtx-root dl,.dtx-root dd,.dtx-root dt,.dtx-root figure {margin:0}
.dtx-root :where(button,input,select) {font:inherit}
.dtx-root button,.dtx-root a {-webkit-tap-highlight-color:transparent}
.dtx-root button {cursor:pointer}
.dtx-root button:disabled {cursor:default; opacity:.45}
.dtx-root :is(button,a,input,select,[tabindex]):focus-visible {outline:2px solid var(--dtx-ink-accent); outline-offset:2px; border-radius:2px}
.dtx-root a {text-decoration:none}
.dtx-root svg {flex-shrink:0}
.dtx-root [hidden] {display:none!important}

/* One label style for the whole component — small-caps monospace. A reader
   learns it once and then recognises every label on sight. */
.dtx-label, .dtx-stat-label {
  font-family:var(--dtx-mono); font-size:9.5px; font-weight:600;
  letter-spacing:.13em; text-transform:uppercase; color:var(--dtx-faint);
}

/* ---------------------------------------------------------------- masthead */
/* The identity rule: a short red stroke, the only large use of brand red on
   the page, sitting where a ledger's header rule would. */
.dtx-mast {position:relative; padding:26px 26px 22px}
.dtx-mast::before {content:""; position:absolute; left:26px; top:0; width:46px; height:3px; background:var(--dtx-accent)}
.dtx-back {display:inline-flex; align-items:center; gap:5px; padding:0; margin-bottom:20px; border:0; background:transparent; color:var(--dtx-mute); font-size:12px}
.dtx-back:hover {color:var(--dtx-ink)}
.dtx-identity {display:flex; gap:18px; align-items:flex-start}
.dtx-mono {
  width:52px; height:52px; border-radius:3px; display:flex; align-items:center; justify-content:center;
  flex-shrink:0; color:#fff; background:var(--dtx-ink); font-family:var(--dtx-mono);
  font-size:19px; font-weight:600; letter-spacing:-.5px;
}
.dtx-idbody {flex:1; min-width:0}
.dtx-eyebrow {display:flex; align-items:center; gap:7px; flex-wrap:wrap; font-family:var(--dtx-mono); font-size:9.5px; font-weight:600; letter-spacing:.13em; text-transform:uppercase; color:var(--dtx-faint)}
.dtx-dot {width:2px; height:2px; border-radius:50%; background:var(--dtx-faint)}
.dtx-root .dtx-name {margin-top:7px; font-size:32px; font-weight:600; line-height:1.08; letter-spacing:-.9px; color:var(--dtx-ink); overflow-wrap:anywhere}
.dtx-sub {display:flex; align-items:center; flex-wrap:wrap; gap:9px; margin-top:11px; font-size:13px; color:var(--dtx-ink-2)}
.dtx-spec {font-weight:600; color:var(--dtx-ink)}
.dtx-codebtn {display:inline-flex; align-items:center; gap:5px; padding:0; border:0; background:transparent; color:var(--dtx-mute); font-family:var(--dtx-mono); font-size:11.5px}
.dtx-codebtn:hover {color:var(--dtx-ink)}
.dtx-codebtn--done {color:var(--dtx-good)}
/* The grade is a stamp, not a stat tile. */
.dtx-grade {flex-shrink:0; text-align:center; min-width:52px; padding:7px 11px 8px; border:1px solid var(--dtx-line); border-radius:3px}
.dtx-grade-label {font-family:var(--dtx-mono); font-size:8.5px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:var(--dtx-faint)}
.dtx-grade-value {font-family:var(--dtx-mono); font-size:22px; font-weight:600; color:var(--dtx-ink); line-height:1.2; margin-top:2px}

.dtx-actions {display:flex; flex-wrap:wrap; gap:7px; margin-top:22px}
.dtx-act {
  display:inline-flex; justify-content:center; align-items:center; gap:6px;
  min-height:36px; padding:7px 13px; border:1px solid var(--dtx-line); border-radius:4px;
  background:#fff; color:var(--dtx-ink-2); font-size:12.5px; font-weight:500;
  transition:background .12s,border-color .12s,color .12s;
}
.dtx-act:hover {background:var(--dtx-ground); border-color:var(--dtx-mute); color:var(--dtx-ink)}
.dtx-act--primary {color:#fff; background:var(--dtx-ink-accent); border-color:var(--dtx-ink-accent); font-weight:600}
.dtx-act--primary:hover {background:var(--dtx-accent); border-color:var(--dtx-accent); color:#fff}
/* Offered but not usable: still named, so the reader learns the number is
   missing rather than wondering where the button went. */
.dtx-act--off {opacity:.45; cursor:default; color:var(--dtx-mute)}
.dtx-act--off:hover {background:#fff; border-color:var(--dtx-line); color:var(--dtx-mute)}

/* --------------------------------------------------- the balance (signature) */
/* Reads as one statement line, so the parts stay together: space-between threw
   "Last POB" a thousand pixels from the figure it belongs to on a wide screen. */
.dtx-balance {
  display:flex; align-items:flex-end; justify-content:flex-start; gap:56px; flex-wrap:wrap;
  padding:22px 26px 20px; border-top:1px solid var(--dtx-line); background:var(--dtx-ground);
}
.dtx-balance-figure {min-width:0}
.dtx-balance-value {
  margin-top:9px; font-family:var(--dtx-mono); font-size:38px; font-weight:600;
  letter-spacing:-1.6px; line-height:1; color:var(--dtx-ink); font-variant-numeric:tabular-nums;
}
.dtx-balance-sub {margin-top:9px; font-size:12px; color:var(--dtx-mute)}
.dtx-balance-right {display:flex; align-items:flex-end; gap:22px}
.dtx-balance-note {text-align:left}
.dtx-balance-note b {display:block; margin-top:7px; font-family:var(--dtx-mono); font-size:14px; font-weight:600; color:var(--dtx-ink); white-space:nowrap}

/* The sparkline sits on the balance's own baseline — the trend belongs to the
   figure, not to a chart in its own panel. */
.dtx-spark {display:flex; align-items:flex-end; gap:3px; height:38px}
.dtx-spark-cap {margin-top:8px}
.dtx-spark-bar {width:7px; min-height:2px; border-radius:1px; background:var(--dtx-line); flex-shrink:0}
.dtx-spark-bar--on {background:var(--dtx-accent)}
.dtx-spark-bar--last {background:var(--dtx-ink)}

/* ------------------------------------------------------------------ vitals */
/* One ruled row instead of four big-number tiles. On a typical doctor three of
   those tiles read "0" or "No visits yet", and leading with big numbers that
   are mostly empty makes the page look emptier than the record is. */
.dtx-stats {display:flex; flex-wrap:wrap; border-top:1px solid var(--dtx-line)}
.dtx-stat {flex:1 1 130px; min-width:0; padding:13px 26px 14px; border-left:1px solid var(--dtx-line-soft)}
.dtx-stat:first-child {border-left:0}
.dtx-stat-value {margin-top:7px; font-family:var(--dtx-mono); font-size:15px; font-weight:600; color:var(--dtx-ink); font-variant-numeric:tabular-nums; overflow-wrap:anywhere; line-height:1.3}
.dtx-stat-sub {margin-top:3px; font-size:11px; color:var(--dtx-mute); overflow-wrap:anywhere}

/* -------------------------------------------------------------------- tabs */
.dtx-tabs {display:flex; border-top:1px solid var(--dtx-line); border-bottom:1px solid var(--dtx-line); min-width:0; overflow-x:auto; scrollbar-width:none; background:#fff}
.dtx-tabs::-webkit-scrollbar {display:none}
.dtx-tabs button {
  display:inline-flex; align-items:center; gap:7px; min-height:42px; flex-shrink:0;
  padding:0 18px; border:0; border-bottom:2px solid transparent; background:transparent;
  font-family:var(--dtx-mono); font-size:10px; font-weight:600; letter-spacing:.11em;
  text-transform:uppercase; color:var(--dtx-faint); white-space:nowrap;
}
.dtx-tabs button:first-child {padding-left:26px}
.dtx-tabs button:hover {color:var(--dtx-ink-2)}
.dtx-tabs button[aria-selected="true"] {color:var(--dtx-ink); border-bottom-color:var(--dtx-accent)}
.dtx-tabs button span {font-size:9.5px; font-weight:500; color:var(--dtx-faint)}
.dtx-tabs button[aria-selected="true"] span {color:var(--dtx-ink-accent)}

/* ---------------------------------------------------------------- sections */
/* Not cards. One sheet, ruled — the eyebrow sits on the rule and the count
   opposite it, so a section needs no header bar, no icon, and no subtitle
   restating its own name. */
.dtx-body {display:flex; flex-direction:column}
.dtx-card {background:#fff; border-top:1px solid var(--dtx-line); min-width:0}
.dtx-body > .dtx-card:first-child, .dtx-col > .dtx-card:first-child {border-top:0}
.dtx-head {display:flex; align-items:baseline; gap:12px; padding:22px 26px 0}
.dtx-head h2 {font-family:var(--dtx-mono); font-size:10px; font-weight:600; letter-spacing:.13em; text-transform:uppercase; color:var(--dtx-faint)}
.dtx-count {margin-left:auto; font-family:var(--dtx-mono); font-size:10px; font-weight:600; color:var(--dtx-mute); font-variant-numeric:tabular-nums}
.dtx-pad {padding:16px 26px 22px}

.dtx-grid {display:grid; grid-template-columns:minmax(0,1.55fr) minmax(0,1fr); align-items:start}
.dtx-col {display:flex; flex-direction:column; min-width:0}
.dtx-sidebar {border-left:1px solid var(--dtx-line)}
.dtx-sidebar > .dtx-card:first-child {border-top:0}

/* ------------------------------------------------------------------ ledger */
/* Quotations are the account's line items, so they are set as ledger rows:
   date left, document number and party in the middle, figure right — all
   figures monospaced on one right edge so they compare by eye. */
.dtx-quotation {border-top:1px solid var(--dtx-line-soft)}
.dtx-quotation:first-of-type {border-top:0}
.dtx-quotation summary {display:flex; align-items:baseline; gap:14px; padding:13px 26px; list-style:none; cursor:pointer}
.dtx-quotation summary::-webkit-details-marker {display:none}
.dtx-quotation summary:hover {background:var(--dtx-ground)}
.dtx-quotation[open] summary {background:var(--dtx-ground)}
.dtx-date-box {flex-shrink:0; width:52px; font-family:var(--dtx-mono); font-size:11px; font-weight:600; letter-spacing:.02em; text-transform:uppercase; color:var(--dtx-mute)}
.dtx-quotation-main {flex:1; min-width:0}
.dtx-quotation-main b {display:block; font-size:13px; font-weight:500; color:var(--dtx-ink); overflow-wrap:anywhere}
.dtx-quotation-main small {display:block; margin-top:3px; font-family:var(--dtx-mono); font-size:10px; color:var(--dtx-faint); overflow-wrap:anywhere}
.dtx-quotation-right {flex-shrink:0; display:flex; align-items:baseline; gap:11px; font-family:var(--dtx-mono); font-size:13px; font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap}
.dtx-chevron {width:11px; color:var(--dtx-faint); transition:transform .15s}
.dtx-quotation[open] .dtx-chevron {transform:rotate(180deg)}

/* Status carries a word, always, so state never rests on colour — and never
   red, which is the brand here and would read as one system shouting. */
.dtx-pill {display:inline-flex; align-items:center; gap:4px; padding:2px 7px; border-radius:3px; border:1px solid transparent; font-family:var(--dtx-mono); font-size:9.5px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; white-space:nowrap}
.dtx-pill--won {color:var(--dtx-good); background:var(--dtx-good-soft); border-color:#c9e4d5}
.dtx-pill--draft {color:var(--dtx-warn); background:var(--dtx-warn-soft); border-color:#ecdcbe}
.dtx-pill--lost {color:var(--dtx-void); background:var(--dtx-void-soft); border-color:#ddd2d0}
.dtx-pill--open {color:var(--dtx-ink-2); background:var(--dtx-line-soft); border-color:var(--dtx-line)}
.dtx-pill--soft {color:var(--dtx-ink-2); background:var(--dtx-line-soft); border-color:var(--dtx-line)}
.dtx-pill--accent {color:var(--dtx-ink-accent); background:var(--dtx-soft)}

/* ------------------------------------------------------- month bars & rank */
.dtx-chart {display:flex; align-items:flex-end; gap:10px; height:104px; padding-top:6px; border-bottom:1px solid var(--dtx-line)}
.dtx-bar-wrap {flex:1 1 0; min-width:0; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; gap:5px}
.dtx-bar-val {height:12px; font-family:var(--dtx-mono); font-size:9.5px; font-weight:600; color:var(--dtx-ink-2); white-space:nowrap}
/* Ink bars, red only on the latest month — see MonthChart for why. */
.dtx-bar {width:100%; max-width:34px; min-height:2px; border-radius:2px 2px 0 0; background:#cdbfba}
.dtx-bar--latest {background:var(--dtx-accent)}
.dtx-bar--empty {background:var(--dtx-line-soft); min-height:4px}
.dtx-bar-label {font-family:var(--dtx-mono); font-size:9.5px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--dtx-faint)}
.dtx-chart-foot {display:flex; justify-content:space-between; gap:14px; margin-top:11px; font-size:11.5px; color:var(--dtx-mute)}
.dtx-chart-foot b {font-family:var(--dtx-mono); font-weight:600; color:var(--dtx-ink)}

/* One product is not a ranking, so a single row draws no bar. Bars appear from
   two products up, where the comparison means something. */
.dtx-rank {display:flex; flex-direction:column}
.dtx-rank-row {padding:12px 0; border-top:1px solid var(--dtx-line-soft)}
.dtx-rank-row:first-child {border-top:0}
.dtx-rank-top {display:flex; align-items:baseline; gap:12px}
.dtx-product-name {flex:1; min-width:0; font-size:13px; font-weight:500; overflow-wrap:anywhere}
.dtx-rank-top small {font-family:var(--dtx-mono); font-size:10px; color:var(--dtx-faint); white-space:nowrap}
.dtx-rank-top b {font-family:var(--dtx-mono); font-size:13px; font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap}


/* ----------------------------------------------------------- ruled details */
.dtx-scroll {overflow-x:auto}
.dtx-def {display:flex; align-items:baseline; gap:16px; padding:10px 26px; border-top:1px solid var(--dtx-line-soft)}
.dtx-def:first-child {border-top:0}
.dtx-def dt {flex-shrink:0; width:112px; font-family:var(--dtx-mono); font-size:9.5px; font-weight:600; letter-spacing:.11em; text-transform:uppercase; color:var(--dtx-faint)}
.dtx-def dd {flex:1; min-width:0; overflow-wrap:anywhere; font-size:13px; font-weight:500; color:var(--dtx-ink)}
.dtx-def dd a {color:var(--dtx-ink-accent); font-weight:500}
.dtx-def dd a:hover {text-decoration:underline}
.dtx-def dd small {display:block; margin-top:3px; font-size:11px; font-weight:400; color:var(--dtx-mute)}

/* Coverage rows — the (division, HQ, beat) pairing is the point, so the beat
   code sits under the division as its document number. */
.dtx-team {display:flex; align-items:baseline; gap:14px; padding:12px 26px; border-top:1px solid var(--dtx-line-soft)}
.dtx-team:first-child {border-top:0}
.dtx-team h3 {flex:1; min-width:0; font-size:13px; font-weight:500; overflow-wrap:anywhere}
.dtx-team-hq {font-size:12px; color:var(--dtx-mute); white-space:nowrap}
.dtx-beat {display:block; margin-top:3px; font-family:var(--dtx-mono); font-size:10px; color:var(--dtx-faint); overflow-wrap:anywhere}

.dtx-address {padding:14px 26px 18px; border-top:1px solid var(--dtx-line-soft)}
.dtx-address:first-child {border-top:0}
.dtx-address p {margin-top:7px; font-size:12.5px; line-height:1.65; color:var(--dtx-ink-2); overflow-wrap:anywhere}

/* ------------------------------------------------------------------- notes */
.dtx-notes {display:flex; flex-direction:column}
.dtx-note {padding:15px 26px; border-top:1px solid var(--dtx-line-soft)}
.dtx-note:first-child {border-top:0}
.dtx-note-when {display:flex; align-items:baseline; gap:9px; font-family:var(--dtx-mono); font-size:9.5px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--dtx-faint)}
.dtx-root .dtx-note-text {margin-top:7px; font-size:13px; line-height:1.65; color:var(--dtx-ink); white-space:pre-wrap; overflow-wrap:anywhere}
.dtx-visit-title {display:flex; align-items:baseline; gap:10px; margin-top:6px}
.dtx-visit-title h3 {flex:1; min-width:0; font-size:13px; font-weight:500; overflow-wrap:anywhere}
.dtx-visit-meta {display:flex; flex-wrap:wrap; gap:4px 12px; margin-top:7px; font-size:11.5px; color:var(--dtx-mute)}
/* Whether the call was actually MADE, taken from the participant stamps rather
   than the Event's own attending column, which is never written. Each state
   carries a word, so it never rests on colour. */
.dtx-visit-made {font-weight:600; color:var(--dtx-good)}
.dtx-visit-unmade {font-weight:600; color:var(--dtx-mute)}
.dtx-visit-forced {font-weight:600; color:var(--dtx-warn)}
.dtx-visit-pob {display:inline-flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:10px; font-family:var(--dtx-mono); font-size:10.5px; color:var(--dtx-good)}
.dtx-text-link {display:inline-flex; align-items:center; gap:4px; margin-top:9px; font-size:12px; color:var(--dtx-ink-accent)}
.dtx-text-link:hover {text-decoration:underline}

/* --------------------------------------------------------- states & chrome */
.dtx-toolbar {display:flex; gap:9px; padding:14px 26px; border-top:1px solid var(--dtx-line-soft)}
.dtx-search {flex:1; min-width:0; display:flex; align-items:center; gap:8px; padding:0 11px; border:1px solid var(--dtx-line); border-radius:4px; background:#fff; color:var(--dtx-faint)}
.dtx-search input {flex:1; min-width:0; padding:9px 0; border:0; outline:0; background:transparent; font-size:12.5px; color:var(--dtx-ink)}
.dtx-select {padding:9px 10px; border:1px solid var(--dtx-line); border-radius:4px; background:#fff; font-size:12.5px; color:var(--dtx-ink-2)}
.dtx-pagination {display:flex; align-items:center; gap:9px; padding:12px 26px; border-top:1px solid var(--dtx-line-soft); font-family:var(--dtx-mono); font-size:10.5px; color:var(--dtx-mute)}
.dtx-pagination button {padding:5px 11px; border:1px solid var(--dtx-line); border-radius:4px; background:#fff; font-family:inherit; font-size:11px; color:var(--dtx-ink-2)}
.dtx-pagination button:first-of-type {margin-left:auto}

/* An empty section is an invitation, not an apology. */
.dtx-empty {max-width:56ch; padding:18px 26px 24px; font-size:12.5px; line-height:1.6; color:var(--dtx-mute)}
.dtx-empty b {display:block; margin-bottom:4px; font-size:13px; font-weight:600; color:var(--dtx-ink)}
.dtx-skel {height:9px; border-radius:2px; background:var(--dtx-line-soft); animation:dtx-pulse 1.4s ease-in-out infinite}
@keyframes dtx-pulse {0%,100%{opacity:1} 50%{opacity:.45}}
.dtx-warn {display:flex; align-items:baseline; gap:11px; padding:12px 26px; border-top:1px solid #ecdcbe; background:var(--dtx-warn-soft); font-size:12px; color:var(--dtx-warn)}
.dtx-warn button {margin-left:auto; padding:4px 10px; border:1px solid #e2cda4; border-radius:4px; background:#fff; font-size:11.5px; font-weight:600; color:var(--dtx-warn); white-space:nowrap}
.dtx-foot {display:flex; flex-wrap:wrap; gap:6px 18px; padding:14px 26px 16px; border-top:1px solid var(--dtx-line); background:var(--dtx-ground); font-family:var(--dtx-mono); font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:var(--dtx-faint)}
.dtx-foot b {font-weight:600; color:var(--dtx-mute)}

/* ------------------------------------------------------- single column
   The measured-width compact mode collapses the two tracks. Both the
   modifier and the descendant form are defined because the JSX applies the
   modifier and the rest of this sheet keys off the root. */
.dtx-grid--compact, .dtx-root--compact .dtx-grid {grid-template-columns:minmax(0,1fr)}
.dtx-root--compact .dtx-sidebar {border-left:0; border-top:1px solid var(--dtx-line)}
.dtx-panel-stack {display:flex; flex-direction:column; min-width:0}

/* --------------------------------------------------- expanded quotation */
/* A quotation opens into its own line items — the sub-ledger behind the row. */
.dtx-quotation-detail {padding:4px 26px 18px; background:var(--dtx-ground); border-top:1px solid var(--dtx-line-soft)}
.dtx-table {width:100%; border-collapse:collapse; font-size:12px}
.dtx-table caption, .dtx-business-caption {
  font-family:var(--dtx-mono); font-size:9.5px; font-weight:600; letter-spacing:.11em;
  text-transform:uppercase; color:var(--dtx-faint); text-align:left; padding:12px 0 8px;
}
.dtx-table th {
  padding:6px 10px 6px 0; text-align:left; white-space:nowrap;
  font-family:var(--dtx-mono); font-size:9px; font-weight:600; letter-spacing:.1em;
  text-transform:uppercase; color:var(--dtx-faint); border-bottom:1px solid var(--dtx-line);
}
.dtx-table td {padding:8px 10px 8px 0; border-bottom:1px solid var(--dtx-line-soft); color:var(--dtx-ink); vertical-align:top}
.dtx-table tr:last-child td {border-bottom:0}
.dtx-table th.dtx-num, .dtx-table td.dtx-num {text-align:right; padding-right:0}
/* Figures line up on one right edge so they can be compared by eye. */
.dtx-num {font-family:var(--dtx-mono); font-variant-numeric:tabular-nums; white-space:nowrap}
.dtx-product-sub {margin-top:3px; font-family:var(--dtx-mono); font-size:9.5px; color:var(--dtx-faint)}
.dtx-quotation-meta {display:flex; flex-wrap:wrap; gap:5px 16px; margin-top:12px; font-family:var(--dtx-mono); font-size:10px; letter-spacing:.04em; color:var(--dtx-faint)}
.dtx-quotation-meta p {flex-basis:100%; font-family:var(--dtx-font,system-ui,sans-serif); font-size:11.5px; letter-spacing:0; color:var(--dtx-mute); line-height:1.6}

/* A quiet text button, not a call to action. */
.dtx-more {display:inline-flex; align-items:center; margin-top:14px; padding:0; border:0; background:transparent; font-family:var(--dtx-mono); font-size:10px; font-weight:600; letter-spacing:.11em; text-transform:uppercase; color:var(--dtx-ink-accent)}
.dtx-more:hover {text-decoration:underline}

/* ----------------------------------------------------- coverage & people */
.dtx-coverage {display:flex; flex-direction:column}
.dtx-team p {margin-top:2px; font-size:12px; color:var(--dtx-mute)}
.dtx-assignee {display:flex; align-items:center; gap:7px; margin-top:8px; font-size:12px; color:var(--dtx-ink-2)}
.dtx-avatar-small {
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
  width:20px; height:20px; border-radius:2px; background:var(--dtx-line-soft);
  color:var(--dtx-ink-2); font-family:var(--dtx-mono); font-size:9px; font-weight:600;
}

/* ---------------------------------------------------------- addresses */
.dtx-addresses {display:flex; flex-direction:column}
.dtx-address-title {display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; color:var(--dtx-ink)}
.dtx-address-title svg {color:var(--dtx-faint); width:14px; height:14px}
.dtx-contact-missing {padding:16px 26px 4px; font-size:12.5px; color:var(--dtx-mute)}
.dtx-root--compact .dtx-contact-missing {padding-left:16px; padding-right:16px}

/* --------------------------------------------------------- definitions */
.dtx-defs {display:flex; flex-direction:column}

/* ------------------------------------------------- classification locator */
/* Only rendered when the doctor carries one of the four two-axis codes, which
   most do not — see the axis-name caveat on the component's props. */
.dtx-matrix {display:flex; align-items:flex-start; gap:18px; padding:16px 26px 20px}
.dtx-matrix--compact {flex-direction:column; gap:14px}
.dtx-root--compact .dtx-matrix {padding-left:16px; padding-right:16px}
.dtx-matrix-figure {flex-shrink:0}
.dtx-matrix-legend {display:flex; flex-direction:column; gap:9px; min-width:0}
.dtx-matrix-note {font-size:12px; line-height:1.6; color:var(--dtx-mute)}
.dtx-matrix-note b {font-weight:600; color:var(--dtx-ink)}

/* ----------------------------------------------------------------- compact */
/* Driven by the MEASURED container width, never a media query — the same
   instance has to work full-width, in a column, and in a 360px frame. */
.dtx-root--compact {border-radius:11px}
.dtx-root--compact .dtx-mast {padding:20px 16px 18px}
.dtx-root--compact .dtx-mast::before {left:16px; width:38px}
.dtx-root--compact .dtx-identity {gap:13px}
.dtx-root--compact .dtx-mono {width:42px; height:42px; font-size:16px}
.dtx-root--compact .dtx-name {font-size:23px; letter-spacing:-.6px}
.dtx-root--compact .dtx-sub {gap:8px; margin-top:9px; font-size:12px}
.dtx-root--compact .dtx-grade {min-width:44px; padding:5px 8px 6px}
.dtx-root--compact .dtx-grade-value {font-size:18px}
.dtx-root--compact .dtx-actions {gap:6px; margin-top:18px}
.dtx-root--compact .dtx-act {min-height:38px; padding:7px 11px; font-size:12px}
.dtx-root--compact .dtx-balance {gap:16px; padding:18px 16px 16px}
.dtx-root--compact .dtx-balance-value {font-size:30px; letter-spacing:-1.1px}
.dtx-root--compact .dtx-balance-right {width:100%; justify-content:space-between}
.dtx-root--compact .dtx-stat {flex:1 1 45%; padding:12px 16px}
.dtx-root--compact .dtx-stat:nth-child(odd) {border-left:0}
.dtx-root--compact .dtx-stat:nth-child(n+3) {border-top:1px solid var(--dtx-line-soft)}
.dtx-root--compact .dtx-tabs button {padding:0 13px; font-size:9.5px}
.dtx-root--compact .dtx-tabs button:first-child {padding-left:16px}
.dtx-root--compact .dtx-head {padding:18px 16px 0}
.dtx-root--compact .dtx-pad {padding:14px 16px 18px}
.dtx-root--compact .dtx-quotation summary {gap:11px; padding:12px 16px}
.dtx-root--compact .dtx-date-box {width:44px; font-size:10px}
.dtx-root--compact .dtx-quotation-main b {font-size:12.5px}
.dtx-root--compact .dtx-def {gap:12px; padding:10px 16px}
.dtx-root--compact .dtx-def dt {width:88px}
.dtx-root--compact .dtx-team, .dtx-root--compact .dtx-note, .dtx-root--compact .dtx-address {padding-left:16px; padding-right:16px}
.dtx-root--compact .dtx-toolbar, .dtx-root--compact .dtx-pagination, .dtx-root--compact .dtx-empty, .dtx-root--compact .dtx-foot, .dtx-root--compact .dtx-warn {padding-left:16px; padding-right:16px}
.dtx-root--compact .dtx-sidebar {border-left:0}
.dtx-root--compact .dtx-chart {height:88px; gap:7px}

@media(prefers-reduced-motion:reduce) {.dtx-root * {animation:none!important; transition:none!important}}
`;
export default doctorDetailStyles;
