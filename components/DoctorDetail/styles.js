/**
 * The approved design's styling, transcribed from its inline styles.
 *
 * Injected as a prefixed stylesheet rather than written inline on every node,
 * because the Studio canvas does not load the app's stylesheet and the page
 * needs grid templates, sticky table headers and gradients that a style
 * attribute makes unreadable at this volume. Values are the design's own —
 * anything dynamic there (a hue, a bar width, a grid template) stays inline
 * here too.
 *
 * Three traps live in this file because it is a JS template literal:
 *   - a BACKTICK anywhere, comments included, ends the literal and the build
 *     fails with "Parsing ecmascript source code failed";
 *   - a CSS escape such as a backslash-2715 is read as a JS escape, so use the
 *     real glyph instead;
 *   - a dollar-brace opens an interpolation.
 */

const styles = String.raw`
.dx-root {
  --dx-ink: #111827;
  --dx-ink-2: #374151;
  --dx-ink-3: #4b5563;
  --dx-mute: #6b7280;
  --dx-faint: #9aa3b2;
  --dx-line: #e5e7eb;
  --dx-line-2: #f3f4f6;
  --dx-line-3: #f1f3f7;
  --dx-line-4: #eef1f6;
  --dx-rule: #d9dee7;
  --dx-ground: #f6f8fb;
  --dx-raise: #fbfcfe;
  --dx-blue: #1e3a8a;
  --dx-blue-tint: #f4f7fd;
  --dx-blue-line: #d7e0f5;
  --dx-blue-band: #e7edf9;
  --dx-red: #a02019;
  --dx-red-tint: #fcedec;
  --dx-red-line: #f3c9c6;

  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  min-height: 100%;
  background: var(--dx-ground);
  color: var(--dx-ink);
  font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
.dx-root *, .dx-root *::before, .dx-root *::after { box-sizing: border-box; }
.dx-root button { font: inherit; cursor: pointer; }
.dx-root input, .dx-root select, .dx-root textarea { font: inherit; }
.dx-root a { color: var(--dx-blue); text-decoration: none; }
.dx-root a:hover { color: var(--dx-red); }
.dx-root :is(button, select, input, textarea, a, [tabindex]):focus-visible {
  outline: 2px solid var(--dx-blue);
  outline-offset: 2px;
  border-radius: 4px;
}
.dx-num { font-variant-numeric: tabular-nums; }
.dx-break { overflow-wrap: anywhere; }
.dx-clip { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dx-spring { flex: 1; }
.dx-hr { flex: 1; height: 1px; background: var(--dx-line); }

/* ------------------------------------------------------------ breadcrumb */
.dx-crumbs {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  font-size: 11.5px; font-weight: 600; color: var(--dx-mute);
}
.dx-crumbs .dx-sep { color: var(--dx-faint); }
.dx-crumbs .dx-here { color: var(--dx-blue); font-weight: 700; }
.dx-crumb-btn { border: 0; background: none; padding: 0; color: var(--dx-blue); font-weight: 600; }

/* ------------------------------------------------------------------ card */
.dx-card {
  background: #fff; border: 1px solid var(--dx-line);
  border-radius: 14px; overflow: hidden;
}

/* ------------------------------------------------------------------ hero */
.dx-hero { display: flex; align-items: flex-start; gap: 13px; flex-wrap: wrap; padding: 14px 16px 12px; }
.dx-avatar {
  width: 44px; height: 44px; flex: none; border-radius: 12px;
  display: grid; place-items: center;
  background: var(--dx-blue-tint); border: 1px solid var(--dx-blue-line);
  color: var(--dx-blue); font-size: 15px; font-weight: 800;
}
.dx-hero-main { flex: 1 1 230px; min-width: 0; }
.dx-hero-main h1 {
  margin: 0; font-size: 21px; font-weight: 800;
  letter-spacing: -.02em; line-height: 1.2; color: var(--dx-ink);
}
.dx-hero-line {
  display: flex; flex-wrap: wrap; align-items: center; gap: 5px 9px;
  margin-top: 5px; font-size: 12px; color: var(--dx-ink-3);
}
.dx-hero-line .dx-strong { font-weight: 600; color: var(--dx-ink-2); }
.dx-hero-line .dx-pipe { color: var(--dx-rule); }
.dx-hero-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; }
.dx-code {
  padding: 2px 8px; border: 1px solid var(--dx-line); border-radius: 999px;
  background: var(--dx-ground);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px; font-weight: 600; color: var(--dx-ink-3);
}
.dx-tag {
  padding: 2px 8px; border: 1px solid var(--dx-line); border-radius: 999px;
  background: #fff; font-size: 11px; font-weight: 600; color: var(--dx-mute);
}
.dx-hero-since { font-size: 11px; color: var(--dx-mute); }
.dx-hero-side { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.dx-roi {
  display: flex; align-items: center; gap: 9px; padding: 7px 12px;
  border-radius: 12px; background: var(--dx-red-tint); border: 1px solid var(--dx-red-line);
}
.dx-roi span {
  font-size: 10px; font-weight: 800; letter-spacing: .09em;
  text-transform: uppercase; color: var(--dx-red);
}
.dx-roi b { font-size: 20px; font-weight: 800; line-height: 1; color: var(--dx-red); }
.dx-rx {
  display: inline-flex; align-items: center; gap: 7px; min-height: 32px; padding: 0 11px;
  border: 1px solid var(--dx-line); border-radius: 9px; background: var(--dx-ground);
  font-size: 11.5px; font-weight: 600; color: var(--dx-ink-2);
}
.dx-rx i {
  width: 19px; height: 19px; border-radius: 6px; background: var(--dx-blue); color: #fff;
  display: grid; place-items: center; font-style: normal; font-size: 9.5px; font-weight: 800;
}

/* compact hero */
.dx-hero--c { display: flex; align-items: flex-start; gap: 10px; padding: 11px 12px 10px; }
.dx-hero--c h1 { margin: 0; font-size: 16px; font-weight: 800; letter-spacing: -.01em; line-height: 1.25; }
.dx-hero--c .dx-sub { margin-top: 3px; font-size: 11px; line-height: 1.45; color: var(--dx-ink-3); }
.dx-hero--c .dx-sub2 { margin-top: 3px; font-size: 10px; color: var(--dx-mute); }
.dx-roi--c {
  display: flex; align-items: baseline; gap: 5px; padding: 3px 8px; border-radius: 999px;
  background: var(--dx-red-tint); border: 1px solid var(--dx-red-line);
}
.dx-roi--c span { font-size: 9px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; color: var(--dx-red); }
.dx-roi--c b { font-size: 14px; font-weight: 800; color: var(--dx-red); }
.dx-rx--c {
  min-height: 26px; padding: 0 9px; border: 1px solid var(--dx-line); border-radius: 8px;
  background: var(--dx-ground); font-size: 10.5px; font-weight: 700; color: var(--dx-blue); white-space: nowrap;
}

/* ----------------------------------------------------------------- stats */
.dx-stats {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  border-top: 1px solid var(--dx-line-2); background: var(--dx-raise);
}
.dx-stat { padding: 10px 13px; border-left: 1px solid var(--dx-line-2); min-width: 0; }
.dx-stat-l {
  font-size: 10px; font-weight: 700; letter-spacing: .07em;
  text-transform: uppercase; color: var(--dx-mute);
}
.dx-stat-v { margin-top: 3px; font-size: 17px; font-weight: 800; line-height: 1.15; color: var(--dx-blue); }
.dx-stat-v--accent { color: var(--dx-red); }
.dx-stat-s { margin-top: 2px; font-size: 10.5px; line-height: 1.35; color: var(--dx-ink-3); }
.dx-root--compact .dx-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.dx-root--compact .dx-stat { padding: 7px 9px; border-top: 1px solid var(--dx-line-2); }
.dx-root--compact .dx-stat-l { font-size: 9px; letter-spacing: .06em; }
.dx-root--compact .dx-stat-v { margin-top: 1px; font-size: 13.5px; line-height: 1.2; }
.dx-root--compact .dx-stat-s { margin-top: 1px; font-size: 9.5px; line-height: 1.3; }

/* --------------------------------------------------------------- clinics */
.dx-clinics {
  display: flex; flex-direction: column; gap: 7px;
  padding: 10px 14px; border-top: 1px solid var(--dx-line-2);
}
.dx-clinic-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; min-width: 0; }
.dx-eyebrow {
  font-size: 10px; font-weight: 700; letter-spacing: .07em;
  text-transform: uppercase; color: var(--dx-mute);
}
.dx-chip {
  display: inline-flex; align-items: center; gap: 5px; min-height: 28px; padding: 0 11px;
  border: 1px solid var(--dx-line); border-radius: 999px; background: #fff;
  font-size: 11px; font-weight: 600; color: var(--dx-ink-3); white-space: nowrap;
}
.dx-chip i { width: 7px; height: 7px; border-radius: 50%; }
.dx-chip--on { border: 0; font-weight: 700; color: #fff; }
.dx-chip--add {
  border: 1px dashed #b9c4da; font-weight: 700; color: var(--dx-blue);
}
.dx-chip--add i { font-style: normal; font-size: 13px; line-height: 1; width: auto; height: auto; }
.dx-clinic-meta { display: flex; align-items: center; gap: 10px; min-width: 0; }
.dx-clinic-meta .dx-text { flex: 1; min-width: 0; font-size: 11.5px; line-height: 1.4; color: var(--dx-ink-3); }
.dx-clinic-acts { flex: none; display: flex; align-items: center; gap: 8px; }
.dx-map-btn {
  min-height: 28px; padding: 0 11px; border-radius: 999px; background: #fff;
  font-size: 11px; font-weight: 700; white-space: nowrap;
}
.dx-dir { font-size: 11px; font-weight: 700; white-space: nowrap; }

/* --------------------------------------------------------------- actions */
.dx-acts {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  padding: 11px 16px 12px; border-top: 1px solid var(--dx-line-2); background: var(--dx-raise);
}
.dx-btn {
  min-height: 36px; padding: 0 14px; border: 1px solid var(--dx-line); border-radius: 9px;
  background: #fff; font-size: 12.5px; font-weight: 600; color: var(--dx-ink-2);
}
.dx-btn--primary { border-color: var(--dx-red); background: var(--dx-red); color: #fff; }
.dx-btn--ghost { border-color: var(--dx-blue); color: var(--dx-blue); }
.dx-btn--blue { border-color: var(--dx-blue); background: var(--dx-blue); color: #fff; font-weight: 700; }
.dx-root--compact .dx-acts { gap: 6px; padding: 9px 12px 10px; }
.dx-root--compact .dx-acts .dx-btn { flex: 1; min-height: 34px; padding: 0 8px; font-size: 11.5px; }

/* ---------------------------------------------------------------- banner */
.dx-banner-head {
  display: flex; align-items: center; gap: 8px; padding: 0 2px;
  width: 100%; margin: 0 auto;
}
.dx-banner-stage { position: relative; width: 100%; margin: 0 auto; }
.dx-banner-rail { display: flex; align-items: center; justify-content: center; gap: 14px; }
.dx-peek {
  flex: 0 1 118px; min-width: 0; height: 132px;
  display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: 5px;
  padding: 12px; border-radius: 16px; box-shadow: 0 2px 8px rgba(16, 24, 40, .06);
  text-align: left; overflow: hidden;
}
.dx-peek--prev { transform: scale(.93) rotate(-1.6deg); }
.dx-peek--next { transform: scale(.93) rotate(1.6deg); }
.dx-peek span {
  padding: 2px 8px; border-radius: 999px; background: #fff;
  font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
}
.dx-peek b { max-width: 100%; font-size: 15.5px; font-weight: 800; color: var(--dx-ink-2); }
.dx-peek em { max-width: 100%; font-size: 9.5px; line-height: 1.3; color: var(--dx-mute); font-style: normal; }
.dx-banner-slot { position: relative; flex: 0 1 620px; min-width: 0; width: 100%; }
.dx-banner {
  position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px;
  padding: 14px 18px; border-radius: 18px;
  box-shadow: 0 4px 14px rgba(16, 24, 40, .07); overflow: hidden;
}
.dx-banner-ghost { position: absolute; left: -14px; bottom: -34px; opacity: .08; pointer-events: none; }
.dx-banner-lead { flex: 0 0 auto; min-width: 108px; position: relative; }
.dx-banner-kind {
  display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 999px;
  background: #fff; font-size: 9.5px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase;
}
.dx-banner-value {
  display: block; margin-top: 8px; font-size: 25px; font-weight: 800;
  letter-spacing: -.02em; line-height: 1.05; color: var(--dx-ink);
}
.dx-banner-sub { display: block; margin-top: 3px; font-size: 11px; color: var(--dx-ink-3); }
.dx-banner-div { flex: none; width: 1px; align-self: stretch; }
.dx-banner-items { flex: 1 1 230px; min-width: 0; position: relative; }
.dx-banner-items > .dx-eyebrow { font-size: 9.5px; }
.dx-item-row { display: flex; flex-wrap: nowrap; gap: 5px; margin-top: 6px; padding: 0 0 1px; }
.dx-item {
  flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 1px;
  padding: 4px 6px; border: 1px solid var(--dx-line); border-radius: 8px; background: #fff;
}
.dx-item .dx-a { display: block; font-size: 10px; line-height: 1.5; font-weight: 700; color: var(--dx-ink); }
.dx-item .dx-c {
  display: inline-flex; align-self: flex-start; align-items: center; gap: 2px;
  max-width: 100%; width: fit-content; padding: 1px 5px; border-radius: 999px;
  background: var(--dx-line-2); font-size: 8.5px; line-height: 1.5; font-weight: 700; color: var(--dx-ink-3);
}
.dx-item .dx-b { display: block; font-size: 10.5px; line-height: 1.6; font-weight: 800; }
.dx-banner-empty {
  margin-top: 7px; padding: 9px 11px; border: 1px dashed var(--dx-line);
  border-radius: 11px; background: #fff; font-size: 11px; color: var(--dx-mute);
}
.dx-banner-foot { flex: 1 1 100%; display: flex; align-items: center; gap: 10px; padding-top: 2px; }
.dx-banner-foot span { flex: 1; min-width: 0; font-size: 10px; color: var(--dx-mute); }
.dx-view-all {
  flex: 0 0 auto; display: inline-flex; align-items: center; gap: 7px; min-height: 34px; padding: 0 15px;
  border: 0; border-radius: 999px; font-size: 12px; font-weight: 700; color: #fff; white-space: nowrap;
  box-shadow: 0 3px 10px rgba(16, 24, 40, .16);
}
.dx-arrow {
  position: absolute; top: 50%; transform: translateY(-50%); z-index: 4;
  display: grid; place-items: center; width: 28px; height: 28px;
  border: 1px solid var(--dx-line); border-radius: 999px; background: #fff;
  box-shadow: 0 2px 8px rgba(16, 24, 40, .12); font-size: 13px; color: var(--dx-ink-3);
}
.dx-arrow--l { left: -13px; }
.dx-arrow--r { right: -13px; }
.dx-dots { display: flex; justify-content: center; gap: 5px; margin-top: 9px; }
.dx-dot { width: 6px; height: 6px; padding: 0; border: 0; border-radius: 999px; background: #d9dee7; }
.dx-dot--on { width: 22px; background: var(--dx-ink-2); }

/* ---------------------------------------------------------- viewer strip */
.dx-strip { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.dx-strip-who { display: flex; align-items: center; gap: 6px; min-width: 0; }
.dx-pill {
  padding: 3px 9px; border-radius: 999px; background: var(--dx-blue-tint);
  border: 1px solid var(--dx-blue-line); font-size: 10.5px; font-weight: 700;
  color: var(--dx-blue); white-space: nowrap;
}
.dx-strip-note { font-size: 10.5px; color: var(--dx-mute); }
.dx-filter-btn {
  display: inline-flex; align-items: center; gap: 7px; min-height: 34px; padding: 0 12px;
  border: 1px solid var(--dx-line); border-radius: 10px; background: #fff;
  font-size: 11.5px; font-weight: 600; color: var(--dx-ink-2);
}
.dx-filter-btn i { width: 1px; height: 14px; background: var(--dx-line); }
.dx-filter-btn b { font-weight: 700; color: var(--dx-ink-3); }
.dx-filter-btn--on {
  border-color: var(--dx-blue); background: var(--dx-blue-tint);
  font-weight: 700; color: var(--dx-blue);
}
.dx-filter-btn--on i { background: #c3d0ea; }
.dx-filter-btn--on b { color: var(--dx-blue); }
.dx-filter-btn--on .dx-flag { width: 6px; height: 6px; border-radius: 50%; background: var(--dx-red); }

/* ---------------------------------------------------------- panel shells */
.dx-stack { display: flex; flex-direction: column; gap: 12px; }
.dx-panel { background: #fff; border: 1px solid var(--dx-line); border-radius: 14px; }
.dx-panel--flush { overflow: hidden; }
.dx-panel-pad { padding: 9px 11px 10px; }
.dx-panel-head { display: flex; align-items: center; gap: 8px; }
.dx-panel-head h2 {
  margin: 0; font-size: 11.5px; font-weight: 700; letter-spacing: .02em; color: var(--dx-blue);
}
.dx-panel-head .dx-note { font-size: 10px; color: var(--dx-mute); white-space: nowrap; }

/* -------------------------------------------------------------- coverage */
.dx-cov { position: relative; margin-top: 9px; }
.dx-cov-rail {
  position: absolute; left: 12%; right: 12%; top: 18px; height: 2px;
  background: repeating-linear-gradient(90deg, #e2e6ee 0 5px, transparent 5px 10px);
}
.dx-cov-grid { position: relative; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.dx-cov-cell {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 2px 2px 0; border: 0; background: transparent;
}
.dx-cov-ring {
  position: relative; display: grid; place-items: center; width: 38px; height: 38px;
  border-radius: 50%; background: var(--dx-blue); box-shadow: 0 0 0 4px #fff, 0 0 0 6px var(--dx-blue-band);
}
.dx-cov-ring b { font-size: 15px; font-weight: 800; color: #fff; line-height: 1; }
.dx-cov-ring i {
  position: absolute; right: -2px; bottom: -2px; display: grid; place-items: center;
  width: 15px; height: 15px; border-radius: 50%; background: #fff; border: 1px solid var(--dx-blue-line);
  font-style: normal; font-size: 9px; font-weight: 800; color: var(--dx-blue); line-height: 1;
}
.dx-cov-ring--off {
  background: #fff; border: 1px dashed var(--dx-rule); box-shadow: 0 0 0 4px #fff;
}
.dx-cov-ring--off span { font-size: 13px; font-weight: 700; color: #c7cdd8; line-height: 1; }
.dx-cov-role { font-size: 11.5px; font-weight: 800; letter-spacing: .03em; color: var(--dx-blue); }
.dx-cov-role--off { font-weight: 600; color: var(--dx-mute); }
.dx-cov-unit {
  font-size: 9px; font-weight: 700; letter-spacing: .05em;
  text-transform: uppercase; color: var(--dx-mute);
}

/* ----------------------------------------------------------------- chart */
.dx-pager {
  display: flex; align-items: center; gap: 2px; padding: 2px;
  border: 1px solid var(--dx-line); border-radius: 999px; background: var(--dx-ground);
}
.dx-pager button {
  display: grid; place-items: center; width: 24px; height: 24px;
  border: 0; border-radius: 999px; background: #fff; font-size: 12px; color: var(--dx-ink-3);
}
.dx-pager span {
  min-width: 104px; text-align: center; font-size: 10.5px; font-weight: 700;
  color: var(--dx-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dx-chart { display: flex; gap: 9px; margin-top: 11px; }
.dx-chart-y {
  flex: none; width: 44px; height: 184px; display: flex; flex-direction: column;
  justify-content: space-between; font-size: 9px; color: var(--dx-mute); text-align: right;
}
.dx-chart-plot {
  flex: 1; min-width: 0; position: relative; height: 184px; border-bottom: 1px solid var(--dx-rule);
}
.dx-grid-line { position: absolute; left: 0; right: 0; height: 1px; background: var(--dx-line-3); }
.dx-chart-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.dx-cross { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1px dashed var(--dx-faint); }
.dx-marker {
  position: absolute; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; border-radius: 50%;
  border: 2px solid #fff; box-shadow: 0 1px 3px rgba(16, 24, 40, .3);
}
.dx-hit { position: absolute; inset: 0; display: flex; }
.dx-hit button { flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; background: transparent; }
.dx-tip { position: absolute; top: 6px; pointer-events: none; z-index: 3; }
.dx-tip-box {
  min-width: 158px; padding: 8px 10px 9px; border-radius: 10px;
  background: rgba(17, 24, 39, .94); box-shadow: 0 10px 24px rgba(16, 24, 40, .3);
}
.dx-tip-box .dx-tip-t { font-size: 11.5px; font-weight: 800; color: #fff; }
.dx-tip-rows { display: flex; flex-direction: column; gap: 3px; margin-top: 6px; }
.dx-tip-row { display: flex; align-items: center; gap: 8px; }
.dx-tip-row i { flex: none; width: 11px; height: 3px; border-radius: 2px; }
.dx-tip-row span { flex: 1; font-size: 10.5px; color: #c7cdd8; white-space: nowrap; }
.dx-tip-row b { font-size: 11px; font-weight: 800; color: #fff; white-space: nowrap; }
.dx-visrail { display: flex; align-items: center; gap: 0; margin-top: 6px; }
.dx-visrail > span {
  flex: none; width: 44px; padding-right: 9px; text-align: right;
  font-size: 8.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #047857;
}
.dx-visrail-track {
  flex: 1; min-width: 0; display: flex; padding: 3px 0;
  border-top: 1px dashed var(--dx-line); border-bottom: 1px dashed var(--dx-line);
}
.dx-visrail-cell {
  flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center; height: 13px;
}
.dx-visrail-cell i { border-radius: 50%; }
.dx-xaxis { display: flex; gap: 0; margin-top: 4px; padding-left: 53px; }
.dx-xaxis > div { flex: 1; min-width: 0; text-align: center; }
.dx-xlab { font-size: 9.5px; font-weight: 600; text-transform: uppercase; color: var(--dx-mute); }
.dx-xlab--on { font-weight: 800; color: var(--dx-ink); }
.dx-legend { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
.dx-legend button {
  display: inline-flex; align-items: center; gap: 7px; min-height: 30px; padding: 0 11px;
  border: 1px solid var(--dx-line); border-radius: 999px; background: #fff;
}
.dx-legend button i { width: 14px; height: 3px; border-radius: 2px; }
.dx-legend button span { font-size: 11px; font-weight: 600; color: var(--dx-ink-2); }
.dx-legend button b { font-size: 11.5px; font-weight: 800; color: var(--dx-ink); }
.dx-legend button.dx-off { border: 1px dashed var(--dx-rule); background: var(--dx-raise); }
.dx-legend button.dx-off i { background: var(--dx-rule) !important; }
.dx-legend button.dx-off span { color: var(--dx-faint); }
.dx-legend button.dx-off b { font-weight: 700; color: var(--dx-faint); }
.dx-chart-foot { margin: 7px 0 0; font-size: 10px; color: var(--dx-mute); }

/* -------------------------------------------------------- data / activity */
.dx-switchbar {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  padding: 8px 13px; border-top: 1px solid var(--dx-line-2); background: var(--dx-raise);
}
.dx-switch {
  display: flex; gap: 2px; padding: 2px; border: 1px solid var(--dx-blue-line);
  border-radius: 999px; background: #fff;
}
.dx-switch > * {
  display: inline-flex; align-items: center; gap: 5px; min-height: 28px; padding: 0 12px;
  border: 0; border-radius: 999px; background: transparent;
  font-size: 11px; font-weight: 600; color: var(--dx-ink-3);
}
.dx-switch > .dx-on { background: var(--dx-blue); font-weight: 700; color: #fff; }
.dx-switchbar .dx-total { font-size: 10.5px; font-weight: 600; color: var(--dx-mute); white-space: nowrap; }

/* ----------------------------------------------------------------- table */
.dx-tablewrap { padding: 10px 13px 14px; }
.dx-tablebar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 0 0 8px; }
.dx-tablebar .dx-hint { font-size: 10px; color: var(--dx-mute); }
.dx-pivot {
  display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 0 11px;
  border: 1px solid var(--dx-line); border-radius: 999px; background: #fff;
  font-size: 11px; font-weight: 600; color: var(--dx-ink-3);
}
.dx-pivot--on {
  border-color: var(--dx-blue); background: var(--dx-blue); font-weight: 700; color: #fff;
}
.dx-pivot--on .dx-flag { width: 5px; height: 5px; border-radius: 50%; background: #9fd8b4; }
.dx-scroll {
  overflow: auto; max-height: 420px; border: 1px solid var(--dx-line);
  border-radius: 12px; background: #fff;
}
.dx-grp {
  position: sticky; top: 0; z-index: 5; display: grid;
  background: var(--dx-ground); border-bottom: 1px solid var(--dx-line);
}
.dx-grp-first {
  position: sticky; left: 0; z-index: 6; padding: 8px 10px; background: var(--dx-ground);
  border-right: 1px solid var(--dx-line); font-size: 9.5px; font-weight: 700;
  letter-spacing: .06em; text-transform: uppercase; color: var(--dx-mute);
}
.dx-grp-cell {
  padding: 8px 10px; font-size: 10px; font-weight: 700; letter-spacing: .04em;
  text-transform: uppercase; color: var(--dx-ink-2);
  border-left: 1px solid var(--dx-line); white-space: nowrap;
}
.dx-grp-cell--tot {
  font-weight: 800; color: var(--dx-blue); background: #eef3fc; border-left-color: var(--dx-blue-line);
}
.dx-sub {
  position: sticky; top: 33px; z-index: 4; display: grid;
  background: #fff; border-bottom: 1px solid var(--dx-line);
}
.dx-sub-first {
  position: sticky; left: 0; z-index: 5; padding: 7px 10px; background: #fff;
  border-right: 1px solid var(--dx-line); font-size: 11px; font-weight: 700; color: var(--dx-ink);
}
.dx-sub-cell {
  display: flex; align-items: center; justify-content: flex-end; gap: 5px; padding: 7px 10px;
  border: 0; border-left: 1px solid var(--dx-line-3); background: transparent;
  font-size: 10.5px; font-weight: 600; color: var(--dx-ink-3); white-space: nowrap;
}
.dx-sub-cell span { font-size: 9px; color: var(--dx-faint); }
.dx-sub-cell--on { background: var(--dx-blue-tint); font-weight: 800; color: var(--dx-blue); }
.dx-sub-cell--on span { color: inherit; }
.dx-row {
  width: 100%; display: grid; align-items: stretch; text-align: left;
  border: 0; border-bottom: 1px solid var(--dx-line-4); background: transparent;
}
.dx-row-first {
  position: sticky; left: 0; z-index: 3; display: flex; align-items: center; gap: 7px;
  padding: 11px 10px; min-width: 0; background: #fff; border-right: 1px solid var(--dx-line);
}
.dx-row-first i { font-style: normal; font-size: 9px; color: var(--dx-faint); }
.dx-row-first i.dx-open { color: var(--dx-blue); }
.dx-row-first span { font-size: 12px; font-weight: 700; color: var(--dx-ink); }
.dx-cell {
  display: flex; align-items: center; justify-content: flex-end; padding: 11px 10px;
  border-left: 1px solid var(--dx-line-3); font-size: 11.5px; font-weight: 600;
  color: var(--dx-ink-2); white-space: nowrap;
}
.dx-cell--muted { color: var(--dx-faint); font-weight: 500; }
.dx-subrow { display: grid; align-items: stretch; border-bottom: 1px solid var(--dx-line-4); background: #f7f9fe; }
.dx-subrow-first {
  position: sticky; left: 0; z-index: 3; padding: 9px 10px 9px 26px; min-width: 0;
  background: #f7f9fe; border-right: 1px solid var(--dx-line);
  font-size: 11px; font-weight: 600; color: var(--dx-blue);
}
.dx-subcell {
  display: flex; align-items: center; justify-content: flex-end; padding: 9px 10px;
  border-left: 1px solid var(--dx-line-4); font-size: 11px; color: var(--dx-ink-3); white-space: nowrap;
}
.dx-totrow { display: grid; align-items: stretch; background: var(--dx-ground); border-top: 1px solid var(--dx-rule); }
.dx-totrow-first {
  position: sticky; left: 0; z-index: 3; padding: 11px 10px; background: var(--dx-ground);
  border-right: 1px solid var(--dx-line); font-size: 11.5px; font-weight: 800; color: var(--dx-ink);
}
.dx-totcell {
  display: flex; align-items: center; justify-content: flex-end; padding: 11px 10px;
  border-left: 1px solid var(--dx-line); font-size: 11.5px; font-weight: 800;
  color: var(--dx-ink); white-space: nowrap;
}
.dx-tablefoot { margin: 8px 0 0; font-size: 10px; color: var(--dx-mute); }

/* -------------------------------------------------------------- activity */
.dx-filters { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 12px 14px 10px; }
.dx-fchip {
  min-height: 28px; padding: 0 11px; border: 1px solid var(--dx-line); border-radius: 999px;
  background: #fff; font-size: 11.5px; font-weight: 600; color: var(--dx-ink-3);
}
.dx-fchip--on { border-color: var(--dx-blue); background: var(--dx-blue); font-weight: 700; color: #fff; }
.dx-tl { position: relative; padding: 6px 14px 18px 0; }
.dx-tl-spine {
  position: absolute; top: 0; bottom: 16px; left: 33px; width: 2px;
  background: linear-gradient(var(--dx-line), var(--dx-line) 82%, rgba(229, 231, 235, 0));
}
.dx-tl-today { position: relative; padding-left: 56px; padding-bottom: 10px; }
.dx-tl-today span {
  position: absolute; left: 26px; top: 5px; width: 16px; height: 16px; border-radius: 50%;
  background: #fff; border: 2px solid var(--dx-blue); box-shadow: 0 0 0 4px var(--dx-blue-tint);
}
.dx-tl-today div {
  font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--dx-blue);
}
.dx-tl-month { position: relative; padding-left: 56px; margin: 10px 0 8px; }
.dx-tl-month > span {
  position: absolute; left: 29px; top: 6px; width: 10px; height: 10px; border-radius: 50%; background: var(--dx-line);
}
.dx-tl-month-in { display: inline-flex; align-items: center; gap: 8px; }
.dx-tl-month-in span:first-child {
  font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--dx-mute);
}
.dx-tl-count {
  padding: 1px 7px; border-radius: 999px; background: var(--dx-line-2);
  font-size: 10px; font-weight: 700; color: var(--dx-mute);
}
.dx-tl-item { position: relative; padding-left: 56px; padding-bottom: 10px; }
.dx-tl-node {
  position: absolute; left: 28px; top: 15px; width: 12px; height: 12px;
  border-radius: 50%; background: #fff;
}
.dx-tl-stub { position: absolute; left: 40px; top: 20px; width: 14px; height: 2px; background: var(--dx-line); }
.dx-ev { border: 1px solid var(--dx-line); border-radius: 12px; background: #fff; overflow: hidden; }
.dx-ev-head { display: flex; align-items: center; gap: 8px; padding: 8px 11px; }
.dx-ev-kind { font-size: 10.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.dx-ev-when { font-size: 10.5px; color: var(--dx-mute); }
.dx-ev-div { padding: 1px 7px; border-radius: 999px; background: #fff; font-size: 10px; font-weight: 700; }
.dx-ev-body { padding: 9px 11px 10px; }
.dx-ev-title { display: flex; align-items: baseline; gap: 10px; }
.dx-ev-title span { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 600; color: var(--dx-ink); }
.dx-ev-title b { font-size: 13px; font-weight: 800; color: var(--dx-ink); white-space: nowrap; }
.dx-ev-meta { margin-top: 5px; font-size: 11px; color: var(--dx-mute); }
.dx-ev-flag {
  display: inline-block; margin-top: 6px; padding: 1px 7px; border-radius: 999px;
  background: #fdf3e6; border: 1px solid #f5d9b0; font-size: 10px; font-weight: 700; color: #b45309;
}
.dx-ev-split {
  display: inline-flex; align-items: center; gap: 6px; min-height: 30px;
  margin-top: 8px; padding: 0 11px; border: 1px solid var(--dx-blue-line);
  border-radius: 999px; background: var(--dx-blue-tint);
  font-size: 11px; font-weight: 700; color: var(--dx-blue);
}
.dx-tl-foot { position: relative; padding-left: 56px; padding-top: 4px; }
.dx-tl-foot span {
  position: absolute; left: 31px; top: 9px; width: 6px; height: 6px; border-radius: 50%; background: var(--dx-line);
}
.dx-tl-foot div { font-size: 11px; color: var(--dx-mute); }

/* ---------------------------------------------------------------- modals */
.dx-veil {
  position: fixed; inset: 0; z-index: 20; display: flex; justify-content: center;
  overflow: auto; background: rgba(17, 24, 39, .44);
  align-items: flex-start; padding: 16px 14px;
}
.dx-root--compact .dx-veil { align-items: flex-end; padding: 0; }
.dx-sheet {
  width: 100%; background: #fff; border: 1px solid var(--dx-line);
  box-shadow: 0 18px 44px rgba(16, 24, 40, .24); border-radius: 16px;
  margin: auto; overflow: auto;
}
.dx-root--compact .dx-sheet { border-radius: 18px 18px 0 0; margin: 0; max-height: 90vh; max-width: 100% !important; }
.dx-grab { display: flex; justify-content: center; padding: 8px 0 2px; }
.dx-grab i { width: 36px; height: 4px; border-radius: 999px; background: var(--dx-rule); }
.dx-sheet-head {
  display: flex; align-items: center; gap: 10px; padding: 13px 16px;
  border-bottom: 1px solid var(--dx-line-2);
}
.dx-sheet-head h3 { margin: 0; flex: 1; font-size: 14px; font-weight: 700; color: var(--dx-ink); }
.dx-sheet-head .dx-count { font-size: 11px; color: var(--dx-mute); }
.dx-x {
  width: 28px; height: 28px; border: 1px solid var(--dx-line); border-radius: 8px;
  background: #fff; font-size: 13px; color: var(--dx-ink-3);
}
.dx-sheet-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 11px; }
.dx-sheet-foot {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 12px 16px; border-top: 1px solid var(--dx-line-2); background: var(--dx-ground);
}
.dx-sheet-foot--end { justify-content: flex-end; }
.dx-sheet-foot .dx-note { font-size: 10.5px; color: var(--dx-mute); }
.dx-field { display: block; }
.dx-field > span {
  display: block; font-size: 11px; font-weight: 700; letter-spacing: .05em;
  text-transform: uppercase; color: var(--dx-mute);
}
.dx-field input, .dx-field select, .dx-field textarea {
  width: 100%; margin-top: 5px; border: 1px solid var(--dx-line); border-radius: 9px;
  background: #fff; font-size: 13px; color: var(--dx-ink);
}
.dx-field input, .dx-field select { min-height: 38px; padding: 0 10px; }
.dx-field textarea { padding: 8px 10px; resize: vertical; }
.dx-fieldrow { display: flex; gap: 10px; flex-wrap: wrap; }
.dx-sheet-list { display: flex; flex-direction: column; overflow: auto; }
.dx-sheet-row { padding: 11px 16px; border-bottom: 1px solid var(--dx-line-2); }
.dx-sheet-row-t { display: flex; align-items: baseline; gap: 10px; }
.dx-sheet-row-t span { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 700; color: var(--dx-ink); }
.dx-meter { margin-top: 5px; height: 4px; border-radius: 2px; background: var(--dx-line-4); overflow: hidden; }
.dx-meter i { display: block; height: 4px; border-radius: 2px; }
.dx-seg {
  display: flex; gap: 3px; padding: 3px; border: 1px solid var(--dx-line);
  border-radius: 10px; background: var(--dx-ground); width: fit-content;
}
.dx-seg button {
  min-height: 32px; padding: 0 14px; border: 0; border-radius: 8px;
  background: transparent; font-size: 12px; font-weight: 600; color: var(--dx-ink-3);
}
.dx-seg button.dx-on { background: var(--dx-blue); font-weight: 700; color: #fff; }
.dx-opts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin-top: 7px; }
.dx-opt {
  min-height: 36px; padding: 0 12px; border: 1px solid var(--dx-line); border-radius: 10px;
  background: #fff; font-size: 12px; font-weight: 600; color: var(--dx-ink-2); text-align: left;
}
.dx-opt--on { border-color: var(--dx-blue); background: var(--dx-blue); font-weight: 700; color: #fff; }
.dx-picker {
  margin-top: 7px; border: 1px solid var(--dx-line); border-radius: 12px; background: #fff;
  box-shadow: 0 8px 22px rgba(16, 24, 40, .10); overflow: hidden;
}
.dx-picker-head { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-bottom: 1px solid var(--dx-line-2); }
.dx-picker-head button {
  display: grid; place-items: center; width: 26px; height: 26px;
  border: 1px solid var(--dx-line); border-radius: 8px; background: #fff; font-size: 12px; color: var(--dx-ink-3);
}
.dx-picker-head span { flex: 1; text-align: center; font-size: 12.5px; font-weight: 700; color: var(--dx-ink); }
.dx-picker-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 2px; padding: 8px; }
.dx-mcell {
  min-height: 34px; border: 0; border-radius: 9px; background: #fff;
  font-size: 11.5px; font-weight: 600; color: var(--dx-ink-2);
}
.dx-mcell--edge { background: var(--dx-blue); font-weight: 800; color: #fff; }
.dx-mcell--band { background: var(--dx-blue-band); font-weight: 700; color: var(--dx-blue); }
.dx-mcell--off {
  display: grid; place-items: center; background: var(--dx-raise); color: #c7cdd8; cursor: default;
}
.dx-picker-foot {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px;
  border-top: 1px solid var(--dx-line-2); background: var(--dx-ground);
}
.dx-picker-foot span { flex: 1; font-size: 10.5px; color: var(--dx-mute); }
.dx-map { display: block; width: 100%; height: 220px; border: 0; background: var(--dx-line-4); }

/* ---------------------------------------------------------------- states */
.dx-warn {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 9px 12px; border: 1px solid #f5d9b0; border-radius: 10px;
  background: #fdf3e6; font-size: 11.5px; color: #7c4a09;
}
.dx-warn button {
  min-height: 28px; padding: 0 10px; border: 1px solid #e3c391; border-radius: 8px;
  background: #fff; font-size: 11px; font-weight: 700; color: #7c4a09;
}
.dx-empty {
  padding: 14px 16px; border: 1px dashed var(--dx-line); border-radius: 12px;
  background: #fff; font-size: 12px; color: var(--dx-mute);
}
.dx-skeleton {
  border-radius: 8px; background: linear-gradient(90deg, #eef1f6 25%, #f6f8fb 37%, #eef1f6 63%);
  background-size: 400% 100%; animation: dx-shimmer 1.2s ease-in-out infinite;
}
@keyframes dx-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
@media (prefers-reduced-motion: reduce) {
  .dx-skeleton { animation: none; }
}
.dx-foot { margin: 0; font-size: 11px; line-height: 1.55; color: var(--dx-mute); }

/* A single card placed on its own page.
   It keeps every token and reset .dx-root defines -- the card markup is written
   against them -- but drops the PAGE's own frame: the 12px gutter, the grey
   ground and the full-height stretch belong to a page, not to one card. Without
   this, a card nested in the one-drop page would be padded twice. */
/* Standalone helper text. Scoped rules like .dx-tablebar .dx-hint still win
   over this by specificity, so the table bar keeps its smaller size. */
.dx-hint { font-size: 10.5px; line-height: 1.5; color: var(--dx-mute); }

.dx-root--card {
  padding: 0;
  min-height: 0;
  background: transparent;
}
`;

export default styles;
