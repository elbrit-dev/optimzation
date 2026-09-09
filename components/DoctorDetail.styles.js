// Scoped styles render with the component, including server-rendered previews.
//
// DESIGN NOTE — this page belongs to the Elbrit console, and looks like it.
//
// It is built from the same parts as the product detail page (components/
// ProductDetail): white cards on a light ground, 1px #e5e7eb hairlines, a 14px
// radius, navy #1e3a8a for structure, and Inter throughout. Nothing here is a
// new invention — a doctor record and a product record are the same kind of
// object to the same reader, so they read in the same voice. The previous pass
// styled this as a ruled monospace "statement of account", which was coherent
// on its own and belonged to no other page in the product.
//
// Three devices are borrowed by name, because the reader has already learnt
// them on the product page:
//   · the section head   — title, hairline rule, count   (.slc-head)
//   · the divided strip  — figures in bordered cells      (.phx-prices)
//   · the tile grid      — small stats as cards           (.msx-tiles)
//
// Boldness is spent in one place: the POB strip under the identity block, where
// the number this page exists for is set large in navy with its trend in the
// cell beside it. Everything else is quiet.
//
// Monospace is kept for exactly one job — document numbers (SAL-QTN-2026-00040,
// beat codes), where character identity matters. Figures use Inter with
// tabular-nums, which aligns columns without changing voice. Labels are Inter
// at 11px, not mono at 9.5px: this component is read on a phone in a clinic.
//
// --dtx-accent stays the doctor's identity colour (Elbrit red by default, or a
// speciality tone). It is deliberately rationed: monogram tile, active tab,
// latest month, primary action. Navy carries the structure so the accent never
// has to do two jobs at once.
const doctorDetailStyles = `
.dtx-root {
  /* Cool neutrals, matched to the product detail cards rather than invented. */
  --dtx-navy:#1e3a8a;
  /* Every step clears 4.5:1 on both #fff and the #f8fafc ground:
     ink 16.1 · ink-2 10.3 · mute 7.0 · faint 4.8. The product page's own
     caption grey (#9ca3af) is 2.54:1 and is deliberately not used here. */
  --dtx-ink:#111827; --dtx-ink-2:#374151; --dtx-mute:#4b5563; --dtx-faint:#6b7280;
  --dtx-line:#e5e7eb; --dtx-line-soft:#f3f4f6; --dtx-card:#fff; --dtx-ground:#f8fafc;
  --dtx-good:#047857; --dtx-good-soft:#ecfdf5; --dtx-good-line:#a7f3d0;
  --dtx-warn:#b45309; --dtx-warn-soft:#fffbeb; --dtx-warn-line:#fde68a;
  --dtx-void:#4b5563; --dtx-void-soft:#f3f4f6;
  /* Data bars, at 3.0:1 on white — the WCAG floor for a meaningful graphic. */
  --dtx-bar:#8296c0;
  --dtx-mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;

  /* One spacing rhythm. --dtx-gut is the card gutter and is the ONLY value that
     changes between wide and compact, so nothing can drift out of alignment. */
  --dtx-gut:20px; --dtx-gap:14px; --dtx-r:14px; --dtx-r-sm:10px;

  box-sizing:border-box; width:100%; max-width:100%; min-width:0;
  display:flex; flex-direction:column; min-height:0;
  font-family:var(--dtx-font,Inter,system-ui,-apple-system,"Segoe UI",sans-serif);
  font-size:14px; line-height:1.5; color:var(--dtx-ink); background:var(--dtx-ground);
  border:1px solid var(--dtx-line); border-radius:16px; overflow:hidden;
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
.dtx-root button:disabled {cursor:default; opacity:.4}
.dtx-root :is(button,a,input,select,[tabindex]):focus-visible {outline:2px solid var(--dtx-navy); outline-offset:2px; border-radius:4px}
.dtx-root a {text-decoration:none}
.dtx-root svg {flex-shrink:0}
.dtx-root [hidden] {display:none!important}

/* One label style for the whole component. 11px is the floor: below it the
   uppercase tracking stops being legible on a phone held at arm's length. */
.dtx-label, .dtx-stat-label {
  display:block; font-size:11px; font-weight:700; letter-spacing:.07em;
  text-transform:uppercase; color:var(--dtx-faint); line-height:1.3;
}

/* ---------------------------------------------------------------- masthead */
/* The identity block is the hero card: white, edge to edge inside the root,
   sitting above the grey ground that carries everything else. */
.dtx-hero {background:var(--dtx-card)}
.dtx-mast {position:relative; padding:22px var(--dtx-gut) 0}
.dtx-back {
  display:inline-flex; align-items:center; gap:6px; min-height:32px;
  padding:0; margin-bottom:14px; border:0; background:transparent;
  color:var(--dtx-mute); font-size:13px; font-weight:500;
}
.dtx-back:hover {color:var(--dtx-navy)}
.dtx-identity {display:flex; gap:16px; align-items:flex-start}

/* The monogram tile — the one place the doctor's own accent is given area. */
.dtx-mono {
  width:56px; height:56px; border-radius:12px; display:flex; align-items:center; justify-content:center;
  flex-shrink:0; color:var(--dtx-ink-accent); background:var(--dtx-soft);
  border:1px solid var(--dtx-line-accent);
  font-size:20px; font-weight:800; letter-spacing:-.02em;
}
.dtx-idbody {flex:1; min-width:0}
.dtx-eyebrow {
  display:flex; align-items:center; gap:8px; flex-wrap:wrap;
  font-size:11px; font-weight:700; letter-spacing:.07em; text-transform:uppercase; color:var(--dtx-faint);
}
.dtx-dot {width:3px; height:3px; border-radius:50%; background:var(--dtx-line); flex-shrink:0}
.dtx-root .dtx-name {
  margin-top:6px; font-size:28px; font-weight:800; line-height:1.15;
  letter-spacing:-.02em; color:var(--dtx-navy); overflow-wrap:anywhere;
}
.dtx-sub {display:flex; align-items:center; flex-wrap:wrap; gap:8px 10px; margin-top:8px; font-size:13.5px; color:var(--dtx-mute)}
.dtx-spec {font-weight:600; color:var(--dtx-ink-2)}
/* 30px of paint, 44px of target — the overlay below extends the hit area
   without pushing the metadata row taller. */
.dtx-codebtn {
  position:relative; display:inline-flex; align-items:center; gap:5px; min-height:30px;
  padding:2px 9px; border:1px solid var(--dtx-line); border-radius:999px;
  background:var(--dtx-ground); color:var(--dtx-mute);
  font-family:var(--dtx-mono); font-size:11.5px; font-weight:600;
  transition:border-color .15s,color .15s,background .15s;
}
.dtx-codebtn::after {content:""; position:absolute; inset:-7px -4px}
.dtx-codebtn:hover {border-color:var(--dtx-faint); color:var(--dtx-ink-2); background:#fff}
.dtx-codebtn--done {color:var(--dtx-good); border-color:var(--dtx-good-line); background:var(--dtx-good-soft)}

/* The grade is a tile, sized to match the monogram so the identity row has a
   stable top edge on both sides. */
.dtx-grade {
  flex-shrink:0; text-align:center; min-width:60px;
  padding:8px 12px 9px; border:1px solid var(--dtx-line); border-radius:12px; background:var(--dtx-ground);
}
.dtx-grade-label {font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--dtx-faint)}
.dtx-grade-value {font-size:22px; font-weight:800; color:var(--dtx-navy); line-height:1.2; margin-top:1px}

.dtx-actions {display:flex; flex-wrap:wrap; gap:8px; margin-top:18px; padding-bottom:20px}
.dtx-act {
  display:inline-flex; justify-content:center; align-items:center; gap:7px;
  min-height:40px; padding:8px 14px; border:1px solid var(--dtx-line); border-radius:var(--dtx-r-sm);
  background:#fff; color:var(--dtx-ink-2); font-size:13px; font-weight:600;
  transition:background .15s,border-color .15s,color .15s,box-shadow .15s;
}
.dtx-act:hover {background:var(--dtx-ground); border-color:var(--dtx-faint); color:var(--dtx-navy)}
.dtx-act--primary {color:#fff; background:var(--dtx-ink-accent); border-color:var(--dtx-ink-accent)}
.dtx-act--primary:hover {background:var(--dtx-deep-2); border-color:var(--dtx-deep-2); color:#fff}
/* Offered but not usable: still named, so the reader learns the number is
   missing rather than wondering where the button went. */
.dtx-act--off {opacity:.65; cursor:default; color:var(--dtx-mute); background:var(--dtx-ground)}
.dtx-act--off:hover {background:var(--dtx-ground); border-color:var(--dtx-line); color:var(--dtx-mute)}

/* --------------------------------------------------- the POB strip (signature) */
/* The divided bordered strip from the product page's price row, carrying the
   one figure this page exists for. Cells, not a free-floating flex row: the
   trend and the last-POB date now sit in their own boxes instead of being
   baseline-aligned to a number 56px away, which is what came apart at every
   width between phone and desktop. */
.dtx-balance {
  display:flex; align-items:stretch; margin:0 var(--dtx-gut) 20px;
  border:1px solid var(--dtx-line); border-radius:12px; background:var(--dtx-card); overflow:hidden;
}
/* Proportional, not "figure takes all the slack" — at 1.55fr the total had
   ~700px of dead white beside it and the other two cells were pinned to the
   far edge, which read as three unrelated things rather than one strip. */
.dtx-balance--flush {margin:0}
.dtx-balance-figure, .dtx-balance-cell {
  padding:14px 16px; border-left:1px solid var(--dtx-line); min-width:0;
  display:flex; flex-direction:column; justify-content:center;
}
.dtx-balance-figure {flex:1.7 1 0; border-left:0}
.dtx-balance-cell {flex:1 1 0}
.dtx-balance-value {
  margin-top:7px; font-size:30px; font-weight:800; letter-spacing:-.025em;
  line-height:1.1; color:var(--dtx-navy); font-variant-numeric:tabular-nums;
}
.dtx-balance-sub {margin-top:6px; font-size:12px; line-height:1.45; color:var(--dtx-faint)}
.dtx-balance-cell-value {
  margin-top:7px; font-size:15px; font-weight:700; color:var(--dtx-ink);
  font-variant-numeric:tabular-nums; white-space:nowrap;
}

/* The trend lives inside its own cell, so its baseline is its own. */
.dtx-spark {display:flex; align-items:flex-end; gap:3px; height:34px; margin-top:8px}
.dtx-spark-cap {margin-top:6px}
.dtx-spark-bar {width:7px; min-height:2px; border-radius:2px; background:var(--dtx-line); flex-shrink:0}
.dtx-spark-bar--on {background:var(--dtx-bar)}
.dtx-spark-bar--last {background:var(--dtx-accent)}

/* ------------------------------------------------------------------ ground */
/* Everything below the identity card sits on the light ground as separate
   cards, the way the product page stacks its sections. */
.dtx-body {
  display:flex; flex-direction:column; gap:var(--dtx-gap);
  padding:var(--dtx-gap); background:var(--dtx-ground); border-top:1px solid var(--dtx-line);
}

/* ------------------------------------------------------------------ vitals */
/* A real grid, not flex with a 130px basis — that basis wrapped four tiles
   into a ragged 3 + 1 at most container widths. */
.dtx-stats {display:grid; grid-template-columns:repeat(auto-fit,minmax(132px,1fr)); gap:var(--dtx-gap)}
.dtx-stat {
  min-width:0; padding:13px 15px; background:var(--dtx-card);
  border:1px solid var(--dtx-line); border-radius:12px;
}
.dtx-stat-value {
  margin-top:6px; font-size:20px; font-weight:800; color:var(--dtx-navy);
  font-variant-numeric:tabular-nums; overflow-wrap:anywhere; line-height:1.2;
}
.dtx-stat-sub {margin-top:4px; font-size:11.5px; line-height:1.4; color:var(--dtx-faint); overflow-wrap:anywhere}

/* -------------------------------------------------------------------- tabs */
/* A segmented control on the ground, not a full-bleed rule of uppercase mono.
   It reads as a control, which is what it is. */
.dtx-tabs {
  display:flex; gap:4px; padding:4px; min-width:0; overflow-x:auto; scrollbar-width:none;
  background:var(--dtx-card); border:1px solid var(--dtx-line); border-radius:12px;
}
.dtx-tabs::-webkit-scrollbar {display:none}
/* Natural width, left aligned. Stretched to fill the bar, the selected tab
   became a 240px block of tint that read as a banner, not a control. */
.dtx-tabs button {
  display:inline-flex; align-items:center; gap:7px; min-height:36px; flex:0 0 auto;
  justify-content:center; padding:0 14px; border:0; border-radius:9px; background:transparent;
  font-size:13px; font-weight:600; color:var(--dtx-mute); white-space:nowrap;
  transition:background .15s,color .15s;
}
.dtx-tabs button:hover {background:var(--dtx-ground); color:var(--dtx-ink-2)}
.dtx-tabs button[aria-selected="true"] {background:var(--dtx-soft); color:var(--dtx-ink-accent); font-weight:700}
/* The count rides as a badge, so it never reads as part of the label. */
.dtx-tabs button span {
  padding:1px 7px; border-radius:999px; background:var(--dtx-line-soft);
  font-size:11px; font-weight:700; color:var(--dtx-mute); font-variant-numeric:tabular-nums;
}
.dtx-tabs button[aria-selected="true"] span {background:#fff; color:var(--dtx-ink-accent)}

/* ---------------------------------------------------------------- sections */
/* Real cards. The head is the product page's device: title, hairline rule that
   takes the slack, count on the right — so a section needs no header bar, no
   icon and no subtitle restating its own name. */
.dtx-card {
  background:var(--dtx-card); border:1px solid var(--dtx-line); border-radius:var(--dtx-r);
  min-width:0; overflow:hidden;
}
.dtx-head {display:flex; align-items:center; gap:14px; padding:16px var(--dtx-gut) 0}
.dtx-head h2 {flex:none; font-size:16px; font-weight:700; color:var(--dtx-navy); line-height:1.3}
.dtx-rule {flex:1 1 auto; height:1px; min-width:12px; background:var(--dtx-line)}
.dtx-count {
  flex:none; padding:2px 9px; border-radius:999px; background:var(--dtx-line-soft);
  font-size:11.5px; font-weight:700; color:var(--dtx-mute); font-variant-numeric:tabular-nums;
}
.dtx-pad {padding:14px var(--dtx-gut) 18px}

.dtx-grid {display:grid; grid-template-columns:minmax(0,1.55fr) minmax(0,1fr); gap:var(--dtx-gap); align-items:start}
.dtx-col {display:flex; flex-direction:column; gap:var(--dtx-gap); min-width:0}
.dtx-sidebar {min-width:0}
.dtx-panel-stack {display:flex; flex-direction:column; gap:var(--dtx-gap); min-width:0}

/* ----------------------------------------------------------------- revenue */
.dtx-revenue-chart {margin-top:18px}
/* A caveat, not a caption: it says what the number is NOT (billed), so it
   carries a rule above it rather than trailing off the chart. */
.dtx-note-foot {
  margin-top:16px; padding-top:12px; border-top:1px solid var(--dtx-line-soft);
  max-width:70ch; font-size:12px; line-height:1.6; color:var(--dtx-mute);
}
/* The order number belongs to the date line, set apart as a document number. */
.dtx-doc-no {margin-left:auto; font-family:var(--dtx-mono); font-size:11px; font-weight:600; letter-spacing:0; text-transform:none; color:var(--dtx-faint)}
.dtx-rev-amount {flex:none; font-size:14px; font-weight:700; color:var(--dtx-ink); font-variant-numeric:tabular-nums; white-space:nowrap}

/* ------------------------------------------------------------------ ledger */
/* Quotations are the account's line items: date left, party and document
   number in the middle, figure right — figures on one right edge, tabular, so
   they compare by eye. */
.dtx-quotation {border-top:1px solid var(--dtx-line-soft)}
.dtx-quotation:first-of-type {border-top:0}
.dtx-quotation summary {display:flex; align-items:center; gap:14px; padding:12px var(--dtx-gut); list-style:none; cursor:pointer}
.dtx-quotation summary::-webkit-details-marker {display:none}
.dtx-quotation summary:hover {background:var(--dtx-ground)}
.dtx-quotation[open] summary {background:var(--dtx-ground)}
.dtx-date-box {
  flex-shrink:0; width:52px; padding:5px 0; text-align:center;
  border:1px solid var(--dtx-line); border-radius:8px; background:var(--dtx-ground);
  font-size:11px; font-weight:700; letter-spacing:.02em; text-transform:uppercase; color:var(--dtx-mute);
}
.dtx-quotation-main {flex:1; min-width:0}
.dtx-quotation-main b {display:block; font-size:13.5px; font-weight:600; color:var(--dtx-ink); overflow-wrap:anywhere}
.dtx-quotation-main small {display:block; margin-top:3px; font-family:var(--dtx-mono); font-size:11px; color:var(--dtx-faint); overflow-wrap:anywhere}
/* The figures have to land on one right edge or the column cannot be scanned.
   Both the amount and the status get a reserved width, so a ₹9,900 next to a
   ₹1,12,400 still lines up and the pills form their own column. */
.dtx-quotation-right {
  flex-shrink:0; display:flex; align-items:center; justify-content:flex-end; gap:12px;
  font-size:14px; font-weight:700; color:var(--dtx-ink);
  font-variant-numeric:tabular-nums; white-space:nowrap;
}
.dtx-quotation-right > span:first-child {min-width:86px; text-align:right}
.dtx-quotation-right .dtx-pill {min-width:82px; justify-content:center}
.dtx-chevron {width:14px; color:var(--dtx-faint); transition:transform .18s}
.dtx-quotation[open] .dtx-chevron {transform:rotate(180deg)}

/* Status carries a word, always, so state never rests on colour — and never
   red, which is the brand here and would read as one system shouting. */
.dtx-pill {
  display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:999px;
  border:1px solid transparent; font-size:11px; font-weight:700; letter-spacing:.02em;
  white-space:nowrap; line-height:1.4;
}
.dtx-pill--won {color:var(--dtx-good); background:var(--dtx-good-soft); border-color:var(--dtx-good-line)}
.dtx-pill--draft {color:var(--dtx-warn); background:var(--dtx-warn-soft); border-color:var(--dtx-warn-line)}
.dtx-pill--lost {color:var(--dtx-void); background:var(--dtx-void-soft); border-color:var(--dtx-line)}
.dtx-pill--open {color:#1d4ed8; background:#eff6ff; border-color:#bfdbfe}
.dtx-pill--soft {color:var(--dtx-mute); background:var(--dtx-line-soft); border-color:var(--dtx-line)}
.dtx-pill--accent {color:var(--dtx-ink-accent); background:var(--dtx-soft); border-color:var(--dtx-line-accent)}

/* ------------------------------------------------------- month bars & rank */
.dtx-chart {display:flex; align-items:flex-end; gap:10px; height:112px; padding-top:6px; border-bottom:1px solid var(--dtx-line)}
.dtx-bar-wrap {flex:1 1 0; min-width:0; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; gap:6px}
.dtx-bar-val {height:14px; font-size:11px; font-weight:700; color:var(--dtx-ink-2); white-space:nowrap; font-variant-numeric:tabular-nums}
/* Neutral bars, accent only on the latest month — see MonthChart for why. */
.dtx-bar {width:100%; max-width:34px; min-height:2px; border-radius:4px 4px 0 0; background:var(--dtx-bar)}
.dtx-bar--latest {background:var(--dtx-accent)}
.dtx-bar--empty {background:var(--dtx-line); min-height:6px}
.dtx-bar-label {font-size:11px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--dtx-faint)}
.dtx-chart-foot {display:flex; justify-content:space-between; gap:14px; margin-top:12px; font-size:12.5px; color:var(--dtx-mute)}
.dtx-chart-foot b {font-weight:700; color:var(--dtx-ink); font-variant-numeric:tabular-nums}

/* One product is not a ranking, so a single row draws no bar. */
.dtx-rank {display:flex; flex-direction:column}
.dtx-rank-row {padding:11px 0; border-top:1px solid var(--dtx-line-soft)}
.dtx-rank-row:first-child {border-top:0; padding-top:2px}
.dtx-rank-top {display:flex; align-items:baseline; gap:12px}
.dtx-product-name {flex:1; min-width:0; font-size:13.5px; font-weight:500; color:var(--dtx-ink-2); overflow-wrap:anywhere}
.dtx-rank-top small {font-size:11.5px; color:var(--dtx-faint); white-space:nowrap; font-variant-numeric:tabular-nums}
.dtx-rank-top b {font-size:13.5px; font-weight:700; color:var(--dtx-ink); font-variant-numeric:tabular-nums; white-space:nowrap}

/* ----------------------------------------------------------- ruled details */
.dtx-scroll {overflow-x:auto}
.dtx-defs {display:flex; flex-direction:column}
.dtx-def {display:flex; align-items:baseline; gap:16px; padding:11px var(--dtx-gut); border-top:1px solid var(--dtx-line-soft)}
.dtx-def:first-child {border-top:0}
.dtx-def dt {flex-shrink:0; width:112px; font-size:11px; font-weight:700; letter-spacing:.07em; text-transform:uppercase; color:var(--dtx-faint)}
.dtx-def dd {flex:1; min-width:0; overflow-wrap:anywhere; font-size:13.5px; font-weight:500; color:var(--dtx-ink)}
/* Phone and e-mail are tappable actions, not prose links: the padding is
   cancelled by the margin so the target grows and the row does not. */
.dtx-def dd a {display:inline-block; padding:7px 0; margin:-7px 0; color:var(--dtx-navy); font-weight:600}
.dtx-def dd a:hover {text-decoration:underline}
.dtx-def dd small {display:block; margin-top:3px; font-size:11.5px; font-weight:400; color:var(--dtx-faint)}

/* Coverage rows — the (division, HQ, beat) pairing is the point, so the beat
   code sits under the division as its document number. */
.dtx-coverage {display:flex; flex-direction:column}
.dtx-team {padding:13px var(--dtx-gut); border-top:1px solid var(--dtx-line-soft)}
.dtx-team:first-child {border-top:0}
.dtx-team h3 {font-size:13.5px; font-weight:600; color:var(--dtx-ink); overflow-wrap:anywhere}
.dtx-team p {margin-top:3px; font-size:12.5px; color:var(--dtx-mute)}
.dtx-beat {
  display:inline-block; margin-top:8px; padding:2px 8px; border-radius:6px;
  background:var(--dtx-ground); border:1px solid var(--dtx-line);
  font-family:var(--dtx-mono); font-size:11px; color:var(--dtx-mute); overflow-wrap:anywhere;
}
.dtx-assignee {display:flex; align-items:center; gap:8px; margin-top:9px; font-size:12.5px; font-weight:500; color:var(--dtx-ink-2)}
.dtx-avatar-small {
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
  width:24px; height:24px; border-radius:7px; background:var(--dtx-soft);
  color:var(--dtx-ink-accent); font-size:11px; font-weight:700;
}

/* ---------------------------------------------------------------- addresses */
.dtx-addresses {display:flex; flex-direction:column}
.dtx-address {padding:14px var(--dtx-gut) 16px; border-top:1px solid var(--dtx-line-soft)}
.dtx-address:first-child {border-top:0}
.dtx-address p {margin-top:8px; font-size:13px; line-height:1.6; color:var(--dtx-ink-2); overflow-wrap:anywhere}
.dtx-address-title {display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:13.5px; font-weight:700; color:var(--dtx-ink)}
.dtx-address-title svg {color:var(--dtx-faint); width:15px; height:15px}
.dtx-contact-missing {padding:14px var(--dtx-gut) 0; font-size:13px; color:var(--dtx-mute)}
/* Addresses and the detail rows are two lists in one card, so the join needs
   a rule — without it "Get directions" and "Mobile" read as one block. */
.dtx-addresses + .dtx-defs .dtx-def:first-child {border-top:1px solid var(--dtx-line)}

/* ------------------------------------------------------------------- notes */
.dtx-notes {display:flex; flex-direction:column}
.dtx-note {padding:14px var(--dtx-gut); border-top:1px solid var(--dtx-line-soft)}
.dtx-note:first-child {border-top:0}
.dtx-note-when {display:flex; align-items:center; gap:9px; font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--dtx-faint)}
.dtx-root .dtx-note-text {margin-top:8px; font-size:13.5px; line-height:1.6; color:var(--dtx-ink-2); white-space:pre-wrap; overflow-wrap:anywhere}
.dtx-visit-title {display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:7px}
.dtx-visit-title h3 {flex:1; min-width:0; font-size:14px; font-weight:600; color:var(--dtx-ink); overflow-wrap:anywhere}
.dtx-visit-meta {display:flex; flex-wrap:wrap; align-items:center; gap:5px 12px; margin-top:8px; font-size:12px; color:var(--dtx-mute)}
/* Whether the call was actually MADE, taken from the participant stamps rather
   than the Event's own attending column, which is never written. Each state
   carries a word, so it never rests on colour. */
.dtx-visit-made {font-weight:700; color:var(--dtx-good)}
.dtx-visit-unmade {font-weight:700; color:var(--dtx-faint)}
.dtx-visit-forced {font-weight:700; color:var(--dtx-warn)}
.dtx-visit-pob {
  display:inline-flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:10px;
  padding:5px 10px; border-radius:8px; background:var(--dtx-good-soft); border:1px solid var(--dtx-good-line);
  font-size:12px; font-weight:600; color:var(--dtx-good);
}
.dtx-text-link {display:inline-flex; align-items:center; gap:5px; min-height:36px; margin-top:4px; font-size:12.5px; font-weight:600; color:var(--dtx-navy)}
.dtx-text-link:hover {text-decoration:underline}

/* --------------------------------------------------------- states & chrome */
.dtx-toolbar {display:flex; gap:9px; padding:14px var(--dtx-gut); border-top:1px solid var(--dtx-line-soft)}
.dtx-search {
  flex:1; min-width:0; display:flex; align-items:center; gap:9px; padding:0 12px;
  border:1px solid var(--dtx-line); border-radius:var(--dtx-r-sm); background:var(--dtx-ground); color:var(--dtx-faint);
  transition:border-color .15s,background .15s;
}
.dtx-search:focus-within {border-color:var(--dtx-navy); background:#fff}
/* 16px, so iOS does not zoom the page when the field takes focus. */
.dtx-search input {flex:1; min-width:0; padding:10px 0; border:0; outline:0; background:transparent; font-size:16px; color:var(--dtx-ink)}
.dtx-select {
  min-height:42px; padding:0 12px; border:1px solid var(--dtx-line); border-radius:var(--dtx-r-sm);
  background:#fff; font-size:13px; font-weight:500; color:var(--dtx-ink-2);
}
.dtx-pagination {display:flex; align-items:center; gap:9px; padding:12px var(--dtx-gut); border-top:1px solid var(--dtx-line-soft); font-size:12px; color:var(--dtx-mute); font-variant-numeric:tabular-nums}
.dtx-pagination > div {display:flex; gap:8px; margin-left:auto}
.dtx-pagination button {
  min-height:34px; padding:0 13px; border:1px solid var(--dtx-line); border-radius:8px;
  background:#fff; font-size:12.5px; font-weight:600; color:var(--dtx-ink-2);
}
.dtx-pagination button:not(:disabled):hover {border-color:var(--dtx-faint); color:var(--dtx-navy)}

/* An empty section is an invitation, not an apology. */
.dtx-empty {max-width:56ch; padding:16px var(--dtx-gut) 20px; font-size:13px; line-height:1.6; color:var(--dtx-mute)}
.dtx-empty b {display:block; margin-bottom:4px; font-size:13.5px; font-weight:700; color:var(--dtx-ink)}
.dtx-skel {height:11px; border-radius:6px; background:var(--dtx-line-soft); animation:dtx-pulse 1.4s ease-in-out infinite}
@keyframes dtx-pulse {0%,100%{opacity:1} 50%{opacity:.45}}
.dtx-warn {
  display:flex; align-items:center; gap:12px; padding:12px 16px;
  border:1px solid var(--dtx-warn-line); border-radius:12px; background:var(--dtx-warn-soft);
  font-size:12.5px; color:var(--dtx-warn);
}
.dtx-warn button {
  margin-left:auto; min-height:32px; padding:0 12px; border:1px solid var(--dtx-warn-line); border-radius:8px;
  background:#fff; font-size:12.5px; font-weight:700; color:var(--dtx-warn); white-space:nowrap;
}
.dtx-foot {
  display:flex; flex-wrap:wrap; gap:6px 18px; padding:4px 4px 0;
  font-size:11.5px; color:var(--dtx-faint);
}
.dtx-foot b {font-weight:700; color:var(--dtx-mute); font-family:var(--dtx-mono)}

/* --------------------------------------------------- expanded quotation */
/* A quotation opens into its own line items — the sub-ledger behind the row. */
.dtx-quotation-detail {padding:2px var(--dtx-gut) 18px; background:var(--dtx-ground); border-top:1px solid var(--dtx-line-soft)}
.dtx-table {width:100%; border-collapse:collapse; font-size:12.5px}
.dtx-table caption, .dtx-business-caption {
  font-size:11px; font-weight:700; letter-spacing:.07em;
  text-transform:uppercase; color:var(--dtx-faint); text-align:left; padding:14px 0 8px;
}
.dtx-table th {
  padding:7px 10px 7px 0; text-align:left; white-space:nowrap;
  font-size:11px; font-weight:700; letter-spacing:.05em;
  text-transform:uppercase; color:var(--dtx-faint); border-bottom:1px solid var(--dtx-line);
}
.dtx-table td {padding:9px 10px 9px 0; border-bottom:1px solid var(--dtx-line-soft); color:var(--dtx-ink-2); vertical-align:top}
.dtx-table tr:last-child td {border-bottom:0}
.dtx-table th.dtx-num, .dtx-table td.dtx-num {text-align:right; padding-right:0}
/* Figures line up on one right edge so they can be compared by eye. */
.dtx-num {font-variant-numeric:tabular-nums; white-space:nowrap; font-weight:600; color:var(--dtx-ink)}
.dtx-product-sub {margin-top:3px; font-size:11.5px; color:var(--dtx-faint)}
.dtx-quotation-meta {display:flex; flex-wrap:wrap; gap:5px 16px; margin-top:12px; font-size:11.5px; color:var(--dtx-faint)}
.dtx-quotation-meta p {flex-basis:100%; font-size:12px; color:var(--dtx-mute); line-height:1.6}

/* A quiet text button, not a call to action. */
.dtx-more {
  display:inline-flex; align-items:center; min-height:32px; margin-top:10px;
  padding:0; border:0; background:transparent; font-size:12.5px; font-weight:700; color:var(--dtx-navy);
}
.dtx-more:hover {text-decoration:underline}

/* ------------------------------------------------- classification locator */
/* Only rendered when the doctor carries one of the four two-axis codes, which
   most do not — see the axis-name caveat on the component's props. */
.dtx-matrix {display:flex; align-items:center; gap:20px; padding:14px var(--dtx-gut) 18px}
.dtx-matrix--compact {flex-direction:column; align-items:flex-start; gap:14px}
.dtx-matrix-figure {flex-shrink:0}
.dtx-matrix-legend {display:flex; flex-direction:column; align-items:flex-start; gap:10px; min-width:0}
.dtx-matrix-note {font-size:12.5px; line-height:1.6; color:var(--dtx-mute)}
.dtx-matrix-note b {font-weight:700; color:var(--dtx-ink)}

/* ----------------------------------------------------------------- compact */
/* Driven by the MEASURED container width, never a media query — the same
   instance has to work full-width, in a column, and in a 360px frame. Almost
   everything follows from re-pointing --dtx-gut, which is why the compact
   block is short: the rhythm is defined once, above. */
.dtx-root--compact {--dtx-gut:16px; --dtx-gap:12px; border-radius:14px}
.dtx-root--compact .dtx-mast {padding-top:18px}
.dtx-root--compact .dtx-identity {gap:13px}
.dtx-root--compact .dtx-mono {width:46px; height:46px; border-radius:11px; font-size:17px}
.dtx-root--compact .dtx-name {font-size:21px}
.dtx-root--compact .dtx-sub {gap:7px 9px; margin-top:7px; font-size:12.5px}
.dtx-root--compact .dtx-grade {min-width:50px; padding:6px 9px 7px; border-radius:10px}
.dtx-root--compact .dtx-grade-value {font-size:18px}
.dtx-root--compact .dtx-actions {gap:7px; margin-top:16px; padding-bottom:18px}
/* Two per row rather than a ragged wrap, and each one still clears 44px. */
.dtx-root--compact .dtx-act {flex:1 1 calc(50% - 4px); min-height:44px; padding:8px 10px; font-size:12.5px}
/* The strip stacks: three cells side by side under ~380px would put the POB
   total on two lines. */
.dtx-root--compact .dtx-balance {flex-direction:column; margin-bottom:18px}
.dtx-root--compact .dtx-balance-figure, .dtx-root--compact .dtx-balance-cell {border-left:0; border-top:1px solid var(--dtx-line)}
.dtx-root--compact .dtx-balance-figure {border-top:0}
.dtx-root--compact .dtx-balance-value {font-size:26px}
.dtx-root--compact .dtx-stats {grid-template-columns:repeat(2,minmax(0,1fr))}
.dtx-root--compact .dtx-stat-value {font-size:18px}
.dtx-root--compact .dtx-tabs button {flex:0 0 auto; padding:0 12px; font-size:12.5px}
.dtx-root--compact .dtx-head {padding-top:14px}
.dtx-root--compact .dtx-def dt {width:92px}
/* A ledger row cannot hold date + party + figure + status on one phone line:
   the reserved figure and status columns left the party name ~40px and
   overflow-wrap:anywhere shattered it to one letter per line. So the row
   becomes two — date and party above, figure and status below — and the
   reserved widths are dropped, because there is no column left to align to. */
.dtx-root--compact .dtx-quotation summary {flex-wrap:wrap; gap:8px 12px}
.dtx-root--compact .dtx-quotation-main {flex:1 1 120px}
.dtx-root--compact .dtx-chevron {order:1}
.dtx-root--compact .dtx-quotation-right {order:2; flex:1 1 100%; justify-content:flex-start; gap:10px}
.dtx-root--compact .dtx-quotation-right > span:first-child {min-width:0; text-align:left}
.dtx-root--compact .dtx-quotation-right .dtx-pill {min-width:0}
.dtx-root--compact .dtx-chart {height:96px; gap:7px}
.dtx-grid--compact, .dtx-root--compact .dtx-grid {grid-template-columns:minmax(0,1fr)}
.dtx-root--compact .dtx-sidebar {border-left:0}

@media(prefers-reduced-motion:reduce) {.dtx-root * {animation:none!important; transition:none!important}}
`;
export default doctorDetailStyles;
