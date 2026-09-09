// Scoped styles render with the component, including server-rendered previews.
const doctorDetailStyles = `
.dtx-root {
  --dtx-ink:#172238; --dtx-ink-2:#44516a; --dtx-mute:#64748b;
  --dtx-line:#e3e8ef; --dtx-line-soft:#edf0f5; --dtx-card:#fff;
  --dtx-good:#16704f; --dtx-good-soft:#eaf7f0;
  box-sizing:border-box; width:100%; max-width:100%; min-width:0;
  font-family:var(--dtx-font,Inter,system-ui,-apple-system,"Segoe UI",sans-serif);
  font-size:14px; line-height:1.5; color:var(--dtx-ink); background:#f6f8fb;
  border:1px solid var(--dtx-line); border-radius:20px; overflow:hidden;
  -webkit-font-smoothing:antialiased;
}
.dtx-root *, .dtx-root *::before, .dtx-root *::after {box-sizing:border-box}
.dtx-root h1,.dtx-root h2,.dtx-root h3,.dtx-root p,.dtx-root dl,.dtx-root dd,.dtx-root figure {margin:0}
.dtx-root :where(button,input,select) {font:inherit}
.dtx-root button,.dtx-root a {-webkit-tap-highlight-color:transparent}
.dtx-root button {cursor:pointer}
.dtx-root button:disabled {cursor:default; opacity:.45}
.dtx-root :is(button,a,input,select,[tabindex]):focus-visible {outline:3px solid var(--dtx-ink-accent); outline-offset:3px}
.dtx-root a {text-decoration:none}
.dtx-root svg {flex-shrink:0}
.dtx-mast {position:relative; padding:30px 32px 24px; background:#fff; border-top:3px solid var(--dtx-accent); border-bottom:1px solid var(--dtx-line)}
.dtx-back {display:inline-flex; align-items:center; gap:5px; padding:0; margin-bottom:22px; border:0; background:transparent; color:var(--dtx-mute); font-size:12px}
.dtx-identity {display:flex; gap:22px; align-items:center}
.dtx-mono {width:84px; height:84px; border-radius:24px; display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--dtx-ink-accent); background:var(--dtx-soft); border:1px solid var(--dtx-line-accent); font-size:30px; font-weight:750; letter-spacing:-1px}
.dtx-idbody {flex:1; min-width:0}
.dtx-eyebrow {display:flex; align-items:center; gap:8px; flex-wrap:wrap; color:var(--dtx-mute); font-size:11px; font-weight:650; letter-spacing:.06em; text-transform:uppercase}
.dtx-dot {width:3px; height:3px; border-radius:50%; background:#b5becd}
.dtx-root .dtx-name {margin-top:5px; font-size:clamp(24px,2.6vw,34px); font-weight:750; line-height:1.2; letter-spacing:-1px; color:var(--dtx-ink); overflow-wrap:anywhere}
.dtx-sub {display:flex; align-items:center; flex-wrap:wrap; gap:10px; margin-top:12px; font-size:13px; color:var(--dtx-mute)}
.dtx-spec {font-size:11px; letter-spacing:.03em; padding:3px 9px; border-radius:5px; font-weight:700; color:#4742a6; background:#f0efff; border:1px solid #e2dfff}
.dtx-codebtn {display:inline-flex; align-items:center; gap:6px; padding:3px 7px; font-size:11px; color:var(--dtx-mute); background:#fff; border:1px solid var(--dtx-line); border-radius:5px}
.dtx-codebtn--done {color:var(--dtx-good); background:var(--dtx-good-soft)}
.dtx-grade {text-align:center; min-width:80px; padding:10px 18px; border:1px solid var(--dtx-line); border-radius:14px; background:#fafbfd}
.dtx-grade-label {font-size:10px; font-weight:650; letter-spacing:.1em; text-transform:uppercase; color:var(--dtx-mute)}
.dtx-grade-value {font-size:27px; font-weight:750; color:var(--dtx-ink); line-height:1.35}
.dtx-actions {display:flex; flex-wrap:wrap; gap:8px; margin-top:25px}
.dtx-act {display:inline-flex; justify-content:center; align-items:center; gap:7px; min-height:40px; padding:8px 15px; border:1px solid var(--dtx-line); border-radius:8px; background:#fff; color:var(--dtx-ink-2); font-size:12px; font-weight:600; transition:background .15s,border-color .15s}
.dtx-act:hover {background:#f5f7fa; border-color:#b8c2d1}
.dtx-act--primary {color:#fff; background:var(--dtx-ink-accent); border-color:var(--dtx-ink-accent); box-shadow:0 3px 6px #17223812}
.dtx-act--primary:hover {color:#fff; background:var(--dtx-deep-2); border-color:var(--dtx-deep-2)}
.dtx-body {padding:24px 28px}
.dtx-stats {display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px}
.dtx-stat {min-width:0; padding:17px 18px; border:1px solid var(--dtx-line); border-radius:12px; background:white; box-shadow:0 2px 3px #17223802}
.dtx-stat-top {display:flex; justify-content:space-between; align-items:center; gap:6px; color:#8390a5}
.dtx-stat-label {color:var(--dtx-mute); font-size:11px; font-weight:600}
.dtx-stat:first-child .dtx-stat-top svg {color:var(--dtx-ink-accent)}
.dtx-stat-value {margin-top:10px; font-size:23px; letter-spacing:-.65px; font-weight:750; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; line-height:1.25}
.dtx-stat-sub {margin-top:7px; color:var(--dtx-mute); font-size:11px; overflow-wrap:anywhere}
.dtx-grid {display:grid; grid-template-columns:minmax(0,1.85fr) minmax(290px,1fr); gap:22px; align-items:start; margin-top:26px}
.dtx-col {display:grid; gap:18px; min-width:0; align-content:start}
.dtx-card {background:white; border:1px solid var(--dtx-line); border-radius:13px; overflow:hidden; min-width:0; box-shadow:0 2px 3px #17223802}
.dtx-head {display:flex; align-items:center; gap:10px; padding:18px 20px; border-bottom:1px solid var(--dtx-line-soft)}
.dtx-head h2 {font-size:14px; font-weight:700; letter-spacing:-.15px; color:var(--dtx-ink)}
.dtx-section-icon {display:flex; align-items:center; color:#78869c}
.dtx-section-sub {font-size:11px; color:var(--dtx-mute); margin-top:3px!important}
.dtx-count {margin-left:auto; padding:2px 8px; font-size:11px; font-weight:650; background:#f2f5f9; color:var(--dtx-mute); border-radius:6px}
.dtx-tabs {display:flex; gap:22px; border-bottom:1px solid #dce2eb; min-width:0; overflow-x:auto; scrollbar-width:thin}
.dtx-tabs button {display:inline-flex; align-items:center; justify-content:center; gap:7px; min-height:44px; flex-shrink:0; padding:0 0 12px; color:var(--dtx-mute); border:0; border-bottom:2px solid transparent; background:transparent; font-size:13px; font-weight:600; white-space:nowrap}
.dtx-tabs button[aria-selected=true] {border-bottom-color:var(--dtx-ink-accent); color:var(--dtx-ink-accent)}
.dtx-tabs button span {padding:1px 6px; border-radius:5px; font-size:10px; background:#eaf0f6; color:var(--dtx-mute)}
.dtx-tabs button[aria-selected=true] span {background:var(--dtx-soft); color:var(--dtx-ink-accent)}
.dtx-root [hidden] {display:none!important}
.dtx-panel-stack {display:grid; gap:18px}
.dtx-pad {padding:20px}
.dtx-empty {padding:32px 22px; font-size:13px; line-height:1.7; color:var(--dtx-mute)}
.dtx-empty b {display:block; font-weight:650; color:var(--dtx-ink-2); margin-bottom:5px}
.dtx-skel {height:12px; border-radius:5px; background:var(--dtx-line-soft); animation:dtx-pulse 1.5s ease-in-out infinite}
@keyframes dtx-pulse {50%{opacity:.4}}
.dtx-business-top {display:flex; align-items:center; justify-content:space-between; gap:15px; padding:20px 22px 6px}
.dtx-business-value {font-size:28px; font-weight:750; letter-spacing:-1px; margin-top:4px; font-variant-numeric:tabular-nums}
.dtx-business-caption {color:var(--dtx-mute); font-size:11px}
.dtx-business-last {text-align:right; font-size:12px; color:var(--dtx-ink-2)}
.dtx-business-last span {display:block; color:var(--dtx-mute); font-size:11px; margin-bottom:3px}
.dtx-period-summary {display:flex; flex-wrap:wrap; gap:8px 20px; margin:14px 22px 20px; padding-top:14px; border-top:1px solid var(--dtx-line-soft); font-size:11px; color:var(--dtx-mute)}
.dtx-period-summary b {color:var(--dtx-ink-2); font-weight:650}
.dtx-period-summary span:last-child {margin-left:auto}
.dtx-contact-missing {padding:12px 20px; background:#fafbfd; color:var(--dtx-mute); font-size:11px; border-bottom:1px solid var(--dtx-line-soft)}
.dtx-chart {display:flex; align-items:flex-end; gap:8px; height:150px; padding-top:10px}
.dtx-bar-wrap {flex:1; min-width:0; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:7px}
.dtx-bar-val {font-size:10px; font-weight:600; color:var(--dtx-mute); white-space:nowrap}
.dtx-bar {width:100%; max-width:42px; min-height:3px; border-radius:5px 5px 0 0; background:var(--dtx-accent); opacity:.85}
.dtx-bar--empty {background:var(--dtx-line)}
.dtx-bar-label {font-size:10px; color:var(--dtx-mute)}
.dtx-chart-foot {display:flex; flex-wrap:wrap; justify-content:space-between; gap:6px; border-top:1px solid var(--dtx-line-soft); padding-top:12px; margin-top:14px; color:var(--dtx-mute); font-size:11px}
.dtx-chart-foot b {color:var(--dtx-ink-2); font-weight:600}
.dtx-product-list {display:grid; padding:0 20px}
.dtx-product {display:flex; align-items:center; gap:12px; padding:15px 0; border-bottom:1px solid var(--dtx-line-soft)}
.dtx-product:last-child {border-bottom:0}
.dtx-product-icon {display:flex; align-items:center; justify-content:center; width:36px; height:40px; border-radius:8px; background:#f2f5fb; color:#61769b}
.dtx-product-body {flex:1; min-width:0}
.dtx-product-name {font-size:12px; font-weight:650; overflow-wrap:anywhere}
.dtx-product-sub {font-size:11px; color:var(--dtx-mute); margin-top:3px}
.dtx-product-value {font-size:13px; font-weight:650; text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums}
.dtx-rank-track {height:4px; margin-top:9px; border-radius:6px; background:#edf1f7; overflow:hidden; max-width:260px}
.dtx-rank-fill {height:100%; border-radius:6px; background:#8a9bc1}
.dtx-toolbar {display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:14px 18px; border-bottom:1px solid var(--dtx-line-soft)}
.dtx-search {display:flex; flex:1; align-items:center; gap:7px; min-width:160px; background:#fafbfd; border:1px solid var(--dtx-line); padding:7px 10px; border-radius:7px; color:var(--dtx-mute)}
.dtx-search input {width:100%; min-width:0; border:0; background:transparent; color:var(--dtx-ink); font-size:12px; outline:none}
.dtx-search:focus-within {outline:2px solid var(--dtx-ink-accent); outline-offset:2px}
.dtx-select {border:1px solid var(--dtx-line); border-radius:7px; padding:8px; color:var(--dtx-ink-2); background:#fff; font-size:12px!important}
.dtx-quotation {border-bottom:1px solid var(--dtx-line-soft)}
.dtx-quotation:last-child {border-bottom:0}
.dtx-quotation summary {display:flex; align-items:center; gap:13px; padding:17px 20px; cursor:pointer; list-style:none}
.dtx-quotation summary::-webkit-details-marker {display:none}
.dtx-quotation summary:hover {background:#fafbfd}
.dtx-quotation summary:focus-visible {outline:2px solid var(--dtx-ink-accent); outline-offset:-3px}
.dtx-date-box {display:flex; flex-direction:column; align-items:center; justify-content:center; flex-shrink:0; width:42px; min-height:45px; border:1px solid var(--dtx-line); border-radius:8px; color:var(--dtx-ink-2); background:#fafbfd; font-size:16px; font-weight:700; line-height:1.2}
.dtx-date-box small {font-size:9px; text-transform:uppercase; font-weight:600; color:var(--dtx-mute); margin-top:3px}
.dtx-quotation-main {flex:1; min-width:0}
.dtx-quotation-main b {display:block; font-size:12px; font-weight:650; overflow-wrap:anywhere}
.dtx-quotation-main small {display:block; color:var(--dtx-mute); font-size:10px; margin-top:3px; overflow-wrap:anywhere}
.dtx-quotation-right {display:grid; justify-items:end; gap:4px; font-variant-numeric:tabular-nums; white-space:nowrap; font-size:13px; font-weight:650}
.dtx-chevron {color:var(--dtx-mute); transition:transform .15s}
.dtx-quotation[open] .dtx-chevron {transform:rotate(180deg)}
.dtx-quotation-detail {padding:0 20px 18px; background:#fcfdff}
.dtx-scroll {overflow-x:auto}
.dtx-table {width:100%; border-collapse:collapse; font-size:12px; text-align:left}
.dtx-table th {color:var(--dtx-mute); font-size:10px; font-weight:600; padding:10px 8px; border-bottom:1px solid var(--dtx-line)}
.dtx-table td {padding:10px 8px; border-bottom:1px solid var(--dtx-line-soft)}
.dtx-table .dtx-num {text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums}
.dtx-quotation-meta {display:flex; flex-wrap:wrap; gap:6px 18px; font-size:11px; color:var(--dtx-mute); padding:12px 0 0}
.dtx-quotation-meta p {width:100%}
.dtx-pagination {display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; padding:13px 18px; border-top:1px solid var(--dtx-line); color:var(--dtx-mute); font-size:11px}
.dtx-pagination div {display:flex; gap:6px}
.dtx-pagination button,.dtx-more {padding:6px 11px; border:1px solid var(--dtx-line); border-radius:6px; color:var(--dtx-ink-2); background:white; font-size:11px}
.dtx-more {margin:0 20px 15px}
.dtx-pill {display:inline-flex; align-items:center; padding:2px 7px; font-size:10px; font-weight:600; border-radius:5px; line-height:1.6; white-space:nowrap}
.dtx-pill--draft {color:#95631a; background:#fff5df}
.dtx-pill--won {color:var(--dtx-good); background:var(--dtx-good-soft)}
.dtx-pill--open,.dtx-pill--soft {color:#526781; background:#edf2f8}
.dtx-pill--lost {color:#646b77; background:#f0f1f4}
.dtx-pill--accent {color:var(--dtx-ink-accent); background:var(--dtx-soft)}
.dtx-coverage {padding:0 18px}
.dtx-team {display:flex; align-items:flex-start; gap:10px; padding:18px 0; border-bottom:1px solid var(--dtx-line-soft)}
.dtx-team:last-child {border-bottom:none}
.dtx-team>div {min-width:0}
.dtx-team-icon {display:flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:8px; background:#f1f5fb; color:#6a7d9a; flex-shrink:0}
.dtx-team h3 {font-size:12px; font-weight:650; overflow-wrap:anywhere}
.dtx-team p {font-size:11px; color:var(--dtx-mute); margin-top:3px}
.dtx-assignee {display:flex; align-items:center; gap:6px; margin-top:10px; font-size:11px; color:var(--dtx-ink-2)}
.dtx-avatar-small {display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:#edeef9; color:#69648a; font-size:9px; font-weight:700; flex-shrink:0}
.dtx-beat {display:block; color:#7b8799; font-size:10px; margin-top:8px; overflow-wrap:anywhere}
.dtx-def {display:flex; align-items:baseline; gap:12px; padding:12px 20px; border-bottom:1px solid var(--dtx-line-soft)}
.dtx-def:last-child {border-bottom:none}
.dtx-def dt {width:36%; flex-shrink:0; font-size:11px; color:var(--dtx-mute)}
.dtx-def dd {min-width:0; overflow-wrap:anywhere; font-size:12px; font-weight:550}
.dtx-def dd a {color:var(--dtx-ink-accent)}
.dtx-def dd small {display:block; font-size:10px; color:var(--dtx-mute); margin-top:3px}
.dtx-address {padding:18px 20px; border-bottom:1px solid var(--dtx-line-soft)}
.dtx-address-title {display:flex; align-items:center; gap:7px; flex-wrap:wrap; font-size:12px}
.dtx-address-title svg {color:var(--dtx-mute)}
.dtx-address p {font-size:12px; line-height:1.8; color:var(--dtx-mute); margin-top:9px; overflow-wrap:anywhere}
.dtx-text-link {display:inline-flex; gap:5px; align-items:center; font-size:11px; font-weight:650; color:var(--dtx-ink-accent); margin-top:10px}
.dtx-notes {padding:4px 0}
.dtx-note {position:relative; padding:20px 22px 20px 42px}
.dtx-note::before {content:""; position:absolute; left:23px; top:28px; bottom:-28px; width:1px; background:var(--dtx-line)}
.dtx-note:last-child::before {display:none}
.dtx-note::after {content:""; position:absolute; left:19px; top:26px; width:9px; height:9px; border:2px solid white; border-radius:50%; background:var(--dtx-accent); box-shadow:0 0 0 1px var(--dtx-line-accent)}
.dtx-note-when {font-size:11px; color:var(--dtx-mute)}
.dtx-root .dtx-note-text {margin-top:8px; font-size:13px; line-height:1.7; white-space:pre-wrap; overflow-wrap:anywhere}
.dtx-visit-title {display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-top:8px}
.dtx-visit-title h3 {font-size:13px; font-weight:650; overflow-wrap:anywhere}
.dtx-visit-meta {display:flex; flex-wrap:wrap; gap:5px 12px; margin-top:7px; font-size:11px; color:var(--dtx-mute)}
/* Whether the call was actually MADE, taken from the participant stamps rather
   than the Event's own attending column, which is never written. Each state
   carries a word, so it never rests on colour. */
.dtx-visit-made {font-weight:600; color:var(--dtx-good)}
.dtx-visit-unmade {font-weight:600; color:var(--dtx-mute)}
.dtx-visit-forced {font-weight:600; color:var(--dtx-warn)}
.dtx-visit-pob {display:inline-flex; flex-wrap:wrap; gap:5px; padding:5px 8px; border-radius:5px; background:#f0f6f3; color:var(--dtx-good); font-size:11px; margin-top:10px}
.dtx-matrix {display:flex; flex-wrap:wrap; gap:14px; align-items:center}
.dtx-matrix-note {font-size:11px; color:var(--dtx-mute)}
.dtx-foot {display:flex; flex-wrap:wrap; justify-content:space-between; gap:8px; font-size:10px; color:var(--dtx-mute); margin-top:22px}
.dtx-foot b {font-weight:500; margin-left:4px}
.dtx-warn {display:flex; align-items:center; gap:14px; margin-top:18px; padding:12px 15px; border-radius:9px; border:1px solid #f0dcb5; background:#fffaf0; color:#86602b; font-size:12px}
.dtx-warn button {margin-left:auto; background:white; color:#86602b; border:1px solid #e9d0a1; border-radius:5px; padding:4px 10px}
.dtx-root--compact {border-radius:12px}
.dtx-mast--compact {padding:22px 18px 18px}
.dtx-root--compact .dtx-identity {gap:12px; align-items:flex-start}
.dtx-root--compact .dtx-mono {width:52px; height:56px; border-radius:16px; font-size:22px}
.dtx-root--compact .dtx-name {font-size:24px; letter-spacing:-.7px}
.dtx-root--compact .dtx-eyebrow {font-size:9px; gap:5px}
.dtx-root--compact .dtx-grade {min-width:42px; padding:6px 9px; border-radius:9px}
.dtx-root--compact .dtx-grade-label {font-size:8px}
.dtx-root--compact .dtx-grade-value {font-size:21px}
.dtx-root--compact .dtx-sub {gap:7px; font-size:11px; margin-top:9px}
.dtx-root--compact .dtx-actions {gap:7px; margin-top:20px}
.dtx-root--compact .dtx-act {padding:8px 11px; min-height:42px; font-size:11px}
.dtx-body--compact {padding:16px 12px}
.dtx-stats--compact {grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px}
.dtx-root--compact .dtx-stat {padding:13px 12px}
.dtx-root--compact .dtx-stat-value {font-size:20px; margin-top:8px}
.dtx-root--compact .dtx-stat-sub {font-size:10px}
.dtx-root--compact .dtx-stat-label {font-size:10px}
.dtx-grid--compact {grid-template-columns:minmax(0,1fr); gap:20px; margin-top:18px}
.dtx-root--compact .dtx-tabs {gap:18px}
.dtx-root--compact .dtx-tabs button {font-size:12px}
.dtx-root--compact .dtx-head {padding:16px}
.dtx-root--compact .dtx-head h2 {font-size:13px}
.dtx-root--compact .dtx-business-top {padding:18px 16px 5px}
.dtx-root--compact .dtx-business-value {font-size:25px}
.dtx-root--compact .dtx-quotation summary {padding:15px 13px; gap:9px}
.dtx-root--compact .dtx-quotation-main small {font-size:9px}
.dtx-root--compact .dtx-quotation-right {font-size:12px}
.dtx-root--compact .dtx-chevron {width:12px}
.dtx-root--compact .dtx-pad {padding:16px}
.dtx-root--compact .dtx-bar-val {font-size:8px}
.dtx-root--compact .dtx-bar-label {font-size:9px}
@media(prefers-reduced-motion:reduce) {.dtx-root * {animation:none!important; transition:none!important}}
`;
export default doctorDetailStyles;
