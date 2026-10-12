/* The approved prototype's look ("Elbrit Service Workflow"), as prefixed
 * classes injected once — the Studio canvas does not load the app's
 * stylesheet. Colours, sizes and spacing are the prototype's own.
 *
 * Plain CSS inside a JS template literal: never a backtick or a dollar-brace
 * here, not even in a comment. */

const CSS = `
.dsv{--ink:#111827;--ink2:#374151;--ink3:#4B5563;--mute:#6B7280;--faint:#9CA3AF;--line:#E6E9EF;--line2:#EEF0F3;
  --blue:#2563EB;--blue2:#1D4ED8;--navy:#1E3A8A;--bg:#F4F6F9;--red:#DC2626;--green:#15803D;
  font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased;box-sizing:border-box}
.dsv *,.dsv *::before,.dsv *::after{box-sizing:border-box}
.dsv button,.dsv input,.dsv textarea,.dsv select{font-family:inherit}
.dsv button:focus-visible,.dsv input:focus-visible,.dsv textarea:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
.dsv .num{font-variant-numeric:tabular-nums}
@keyframes dsvIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes dsvDrawer{from{transform:translateX(48px);opacity:0}to{transform:none;opacity:1}}
@keyframes dsvSheet{from{transform:translateY(80px);opacity:0}to{transform:none;opacity:1}}
@keyframes dsvFade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.dsv *{animation:none!important;transition:none!important}}

/* ---- page */
.dsv-page{display:flex;flex-direction:column;gap:16px;min-height:0;padding:0}
.dsv-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;flex:none}
.dsv-iconbtn{width:42px;height:42px;flex:none;border-radius:12px;border:1px solid #E1E5EB;background:#fff;display:grid;place-items:center;cursor:pointer}
.dsv-eyebrow{font-size:11px;font-weight:600;letter-spacing:.09em;color:var(--mute);text-transform:uppercase}
.dsv-h1{margin:0;font-size:24px;font-weight:700;letter-spacing:-.01em}
.dsv-narrow .dsv-h1{font-size:22px}
.dsv-headstat{height:42px;padding:0 14px;border-radius:12px;background:#fff;border:1px solid var(--line);display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mute);white-space:nowrap}
.dsv-headstat b{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}
.dsv-newbtn{height:42px;padding:0 16px;border:none;border-radius:12px;background:var(--blue);color:#fff;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap}
.dsv-newbtn:hover{background:var(--blue2)}

/* ---- tabs */
.dsv-tabs{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;flex:none;border-bottom:1px solid #E3E7EC}
.dsv-tab{flex:none;height:44px;padding:0 12px;border:none;border-bottom:2.5px solid transparent;margin-bottom:-1px;background:none;cursor:pointer;display:flex;align-items:center;gap:7px;font-size:14px;font-weight:500;color:var(--ink3);white-space:nowrap;transition:color .15s ease,border-color .15s ease}
.dsv-tab:hover{color:var(--ink)}
.dsv-tab.on{color:var(--blue2);font-weight:700;border-bottom-color:var(--blue)}
.dsv-count{min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:#F1F3F6;color:var(--mute);font-size:11px;font-weight:700;display:grid;place-items:center;font-variant-numeric:tabular-nums}
.dsv-tab.on .dsv-count{background:#EAF1FF;color:var(--blue2)}
.dsv-count.hot{background:#E5484D;color:#fff}

/* ---- team strip */
.dsv-strip{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;flex:none;padding-bottom:2px}
.dsv-team{flex:0 0 auto;min-width:164px;max-width:240px;text-align:left;background:#fff;border:1.5px solid var(--line);border-radius:14px;padding:10px 12px;cursor:pointer;display:flex;flex-direction:column;gap:2px;transition:border-color .15s ease,background-color .15s ease}
.dsv-team.on{background:#EEF4FF;border-color:var(--blue)}
.dsv-team .t{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsv-team .s{font-size:11px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsv-team .v{display:flex;align-items:baseline;gap:6px;margin-top:4px}
.dsv-team .v b{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums}
.dsv-team .v span{font-size:12px;color:var(--mute);font-variant-numeric:tabular-nums}

/* ---- search + filter */
.dsv-tools{display:flex;flex-direction:column;gap:10px;flex:none}
.dsv-searchrow{display:flex;align-items:center;gap:8px}
.dsv-search{height:44px;flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:10px;padding:0 12px 0 14px;background:#fff;border:1px solid #E1E5EB;border-radius:12px}
.dsv-search:focus-within{border-color:var(--blue);box-shadow:0 0 0 3px rgba(37,99,235,.14)}
.dsv-search input{border:none;outline:none;background:transparent;font-size:14px;flex:1;min-width:0}
.dsv-x{width:28px;height:28px;flex:none;border:none;border-radius:50%;background:#F1F3F6;display:grid;place-items:center;cursor:pointer}
.dsv-filterbtn{height:44px;flex:none;padding:0 14px;border-radius:12px;border:1px solid #E1E5EB;background:#fff;color:var(--ink);font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:8px;white-space:nowrap}
.dsv-filterbtn:hover{background:#F6F7F9}
.dsv-badge{min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:var(--blue);color:#fff;font-size:11px;font-weight:700;display:grid;place-items:center}
.dsv-chips{display:flex;align-items:center;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:1px}
.dsv-chip{height:32px;flex:none;padding:0 10px 0 12px;border-radius:999px;border:1px solid #BFD3FB;background:#EEF4FF;color:var(--blue2);font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap}
.dsv-chip .k{font-weight:500;color:var(--mute)}
.dsv-clear{height:32px;flex:none;padding:0 8px;border:none;background:transparent;color:var(--red);font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}

/* ---- split */
.dsv-split{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
.dsv-wide .dsv-split{grid-template-columns:minmax(260px,1fr) minmax(320px,1.35fr);grid-template-rows:minmax(0,1fr);height:max(440px,calc(100vh - 280px))}
.dsv-listpane{display:flex;flex-direction:column;gap:8px;min-height:0;min-width:0}
.dsv-listhead{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--ink2);padding:0 4px;flex:none;min-height:32px}
.dsv-listhead .sum{color:var(--mute);font-size:12px;font-variant-numeric:tabular-nums}
.dsv-list{position:relative;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:8px;padding:2px 4px 8px 2px}
.dsv-wide .dsv-list{overflow-y:auto}
.dsv-cb{width:36px;height:36px;margin:-6px 0 -6px -6px;border:none;background:transparent;display:grid;place-items:center;cursor:pointer;flex:none}
.dsv-box{width:20px;height:20px;border-radius:6px;border:1.5px solid #C5CCD6;background:#fff;display:grid;place-items:center}
.dsv-box.on{border-color:var(--blue);background:var(--blue)}
.dsv-group{flex:none;display:flex;align-items:center;gap:8px;padding:12px 4px 2px}
.dsv-group .gl{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsv-group .gs{font-size:11px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsv-group .rule{flex:1;height:1px;background:#E3E7EC;min-width:12px}
.dsv-group .gt{font-size:12px;font-weight:600;color:var(--ink2);white-space:nowrap;font-variant-numeric:tabular-nums}

/* ---- card */
.dsv-card{flex:none;display:flex;align-items:flex-start;gap:10px;padding:14px 14px 14px 12px;background:#fff;border:1.5px solid var(--line);border-radius:14px;cursor:pointer;transition:box-shadow .15s ease,border-color .15s ease,background-color .15s ease}
.dsv-card:hover{box-shadow:0 4px 14px rgba(17,24,39,.07)}
.dsv-card.sel{background:#F7F9FF;border-color:#BFD3FB}
.dsv-card.focus{background:#EEF4FF;border-color:var(--blue)}
.dsv-card .cb{width:40px;height:40px;margin:-9px -6px;flex:none;border:none;background:transparent;display:grid;place-items:center;cursor:pointer}
.dsv-card .body{flex:1;min-width:0;display:flex;flex-direction:column;gap:7px}
.dsv-card .r1{display:flex;align-items:baseline;gap:12px}
.dsv-card .doc{flex:1;min-width:0;font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsv-card .amt{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.dsv-card .r2{display:flex;align-items:center;gap:4px 12px;flex-wrap:wrap;font-size:13px;color:var(--ink3);min-width:0}
.dsv-svc{height:22px;padding:0 8px;border-radius:6px;background:#F1F3F6;line-height:22px;font-weight:500;color:#1F2937;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.dsv-card .who{font-weight:500;color:var(--ink2);white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.dsv-card .r3{display:flex;align-items:center;gap:6px 10px;flex-wrap:wrap}
.dsv-pill{height:22px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:600;display:inline-flex;align-items:center;white-space:nowrap}
.dsv-tier{font-weight:700}
.dsv-bars{display:flex;gap:3px}
.dsv-bars span{width:12px;height:4px;border-radius:2px}
.dsv-stage{font-size:12px;color:var(--mute)}

/* ---- empty */
.dsv-empty{background:#fff;border:1px solid var(--line);border-radius:16px;padding:36px 24px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.dsv-empty .ic{width:48px;height:48px;border-radius:14px;background:#EEF4FF;display:grid;place-items:center}
.dsv-empty .t{font-weight:600;font-size:15px}
.dsv-empty .s{font-size:13px;color:var(--mute);max-width:320px}
.dsv-empty button{margin-top:6px;height:40px;padding:0 14px;border:none;border-radius:10px;background:var(--blue);color:#fff;font-weight:600;font-size:13px;cursor:pointer}
.dsv-note{background:#FEF3E2;border:1px solid #F8D9A8;color:#92400E;border-radius:12px;padding:10px 14px;font-size:13px}
.dsv-err{background:#FDF2F2;border:1px solid #F5C2C2;color:#7F1D1D;border-radius:12px;padding:10px 14px;font-size:13px;display:flex;gap:10px;align-items:center}
.dsv-err button{margin-left:auto;border:none;background:transparent;color:var(--red);font-weight:600;cursor:pointer}

/* ---- bulk bar */
.dsv-bulk{position:sticky;z-index:5;flex:none;background:#0F172A;color:#fff;border-radius:14px;padding:10px 10px 10px 16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;box-shadow:0 12px 30px rgba(15,23,42,.25);animation:dsvIn .18s ease-out}
.dsv-wide .dsv-bulk{position:relative}
.dsv-bulk .lab{flex:1 1 140px;font-weight:600;font-size:14px;font-variant-numeric:tabular-nums}
.dsv-bulk button{height:40px;padding:0 12px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
.dsv-bulk .ghost{border:1px solid #334155;background:transparent;color:#CBD5E1;font-weight:500}
.dsv-bulk .rej{border:1px solid #7F1D1D;background:#1E293B;color:#FCA5A5}
.dsv-bulk .fin{border:1px solid #166534;background:#1E293B;color:#86EFAC}
.dsv-bulk .pri{border:none;background:var(--blue);color:#fff;padding:0 16px}
.dsv-bulk .pri:hover{background:#3B82F6}
.dsv-kbd{flex:none;display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--mute);padding:0 4px}
.dsv-kbd span{display:flex;align-items:center;gap:5px}
.dsv-kbd i{font-style:normal;min-width:20px;height:20px;padding:0 5px;border-radius:5px;background:#fff;border:1px solid #D7DCE3;border-bottom-width:2px;display:grid;place-items:center;font-weight:600;color:var(--ink2)}

/* ---- detail */
.dsv-detailwrap{display:flex;flex-direction:column;min-height:0;min-width:0}
.dsv-detail{background:#fff;border:1px solid var(--line);border-radius:18px;display:flex;flex-direction:column;flex:1 1 auto;min-height:0;min-width:0;overflow:hidden}
.dsv-scrim{position:fixed;inset:0;z-index:60;background:rgba(15,23,42,.45);display:flex;flex-direction:column;justify-content:flex-end;animation:dsvFade .18s ease-out}
.dsv-scrim .dsv-detail{flex:0 0 auto;height:90%;border:none;border-radius:22px 22px 0 0;box-shadow:0 -12px 40px rgba(15,23,42,.25);animation:dsvSheet .26s cubic-bezier(.2,.8,.2,1)}
.dsv-grab{flex:none;display:flex;justify-content:center;padding:8px 0 0}
.dsv-grab span{width:40px;height:4px;border-radius:2px;background:#D5DAE1}
.dsv-dscroll{flex:1 1 auto;min-height:0;overflow-y:auto}
.dsv-dhead{padding:18px 20px 20px;display:flex;flex-direction:column;gap:14px;border-bottom:1px solid var(--line2)}
.dsv-dtop{display:flex;align-items:center;gap:8px}
.dsv-dtop .id{flex:1;min-width:0;font-size:12px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsv-close{width:36px;height:36px;flex:none;order:9;margin-right:-6px;border-radius:50%;border:none;background:#F1F3F6;display:grid;place-items:center;cursor:pointer}
.dsv-nav{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--ink3);flex:none}
.dsv-nav button{width:34px;height:34px;border-radius:9px;border:1px solid #E1E5EB;background:#fff;cursor:pointer;display:grid;place-items:center}
.dsv-dmain{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap}
.dsv-dmain h2{margin:0;font-size:20px;font-weight:700;letter-spacing:-.01em}
.dsv-doclink{border:none;background:none;padding:0;cursor:pointer;text-align:left;color:inherit;font:inherit}
.dsv-doclink:hover h2{color:var(--blue2);text-decoration:underline}
.dsv-dmain .sub{font-size:13px;color:var(--mute)}
.dsv-dmain .big{font-size:28px;font-weight:800;letter-spacing:-.02em;line-height:1.1;font-variant-numeric:tabular-nums}
.dsv-dmain .when{font-size:13px;color:var(--ink3);white-space:nowrap}
.dsv-steps{display:flex;padding-top:4px}
.dsv-step{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:6px}
.dsv-step .ln{display:flex;align-items:center;width:100%}
.dsv-step .ln i{flex:1;height:2px}
.dsv-step .dot{width:22px;height:22px;flex:none;border-radius:50%;border:2px solid;display:grid;place-items:center}
.dsv-step .lb{font-size:11px;font-weight:700}
.dsv-step .sb{font-size:10px;color:var(--faint);margin-top:-4px;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.dsv-banner{margin:16px 20px 0;background:#FDF2F2;border:1px solid #F5C2C2;border-radius:12px;padding:12px 14px;font-size:13px;color:#7F1D1D;display:flex;flex-direction:column;gap:2px}
.dsv-banner b{font-weight:600}
.dsv-banner--back{background:#FFF8EB;border-color:#F8D9A0;color:#78350F}
.dsv-sec{padding:12px 20px 14px;border-bottom:1px solid var(--line2);display:flex;flex-direction:column;gap:8px}
.dsv-sec .cap{font-size:12px;color:var(--mute)}
.dsv-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px}
.dsv-fields div{display:flex;flex-direction:column;gap:1px;min-width:0}
.dsv-fields span{font-size:11px;color:var(--faint)}
.dsv-fields b{font-size:13px;font-weight:500;color:#1F2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsv-remark{margin:0;font-size:13px;line-height:1.5;color:#1F2937;text-wrap:pretty}
.dsv-file{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--line);border-radius:12px;max-width:340px;background:#fff;cursor:pointer;text-align:left;text-decoration:none;color:inherit}
.dsv-file:hover{border-color:#93B4F8}
.dsv-file .ext{width:36px;height:36px;flex:none;border-radius:9px;font-size:10px;font-weight:700;display:grid;place-items:center}
.dsv-trail{display:flex;flex-direction:column}
.dsv-ev{display:flex;gap:12px}
.dsv-ev .rail{display:flex;flex-direction:column;align-items:center;width:10px;flex:none;padding-top:5px}
.dsv-ev .rail b{width:10px;height:10px;flex:none;border-radius:50%}
.dsv-ev .rail i{flex:1;width:2px;min-height:14px;background:#E3E7EC;margin:4px 0}
.dsv-ev .tx{flex:1;min-width:0;padding-bottom:14px;display:flex;flex-direction:column;gap:2px}
.dsv-ev .tl{display:flex;gap:8px;align-items:baseline;justify-content:space-between}
.dsv-ev .tl b{font-size:13px;font-weight:600}
.dsv-ev .tl span{font-size:12px;color:var(--mute);white-space:nowrap}
.dsv-ev .nt{margin-top:4px;font-size:13px;color:var(--ink2);background:#F6F7F9;border-radius:10px;padding:8px 10px}
.dsv-comment{padding:6px 20px 18px;display:flex;flex-direction:column;gap:8px}
.dsv-comment label{font-size:12px;color:var(--mute)}
.dsv-ta{border:1px solid #D7DCE3;border-radius:11px;padding:10px 12px;font-size:14px;line-height:1.5;resize:vertical;width:100%}
.dsv-foot{position:relative;flex:none;background:#fff;border-top:1px solid var(--line);padding:12px 16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsv-btn{height:44px;padding:0 16px;border-radius:11px;border:1px solid #D7DCE3;background:#fff;color:var(--ink);font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.dsv-btn:hover{background:#F6F7F9}
.dsv-btn:disabled{opacity:.55;cursor:default}
.dsv-btn.pri{border:none;background:var(--blue);color:#fff;padding:0 18px}
.dsv-btn.pri:hover{background:var(--blue2)}
.dsv-btn.del{border:none;background:transparent;color:var(--red);padding:0 12px}
.dsv-btn.del:hover{background:#FDECEC}
.dsv-btn.rej{border-color:#F5C2C2;color:#B91C1C}
.dsv-btn.rej:hover{background:#FDF2F2}
.dsv-btn.fin{border:1.5px solid var(--green);color:var(--green);padding:0 14px}
.dsv-btn.fin:hover{background:#F0FAF4}
.dsv-btn.navy{border:none;background:var(--navy);color:#fff}
.dsv-btn.navy:hover{background:#172E6E}
.dsv-btn .k{min-width:18px;height:18px;padding:0 4px;border-radius:4px;background:rgba(255,255,255,.2);font-size:11px;display:grid;place-items:center}
.dsv-decide{display:flex;gap:8px;flex:1 1 300px;min-width:0;justify-content:flex-end}
.dsv-decide .dsv-btn{flex:1 1 0;min-width:0}
.dsv-nodetail{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:40px;text-align:center;color:var(--mute);font-size:13px}
.dsv-nodetail b{font-weight:600;color:var(--ink2);font-size:15px}

/* ---- business block */
.dsv-biz{padding:14px 20px 16px;border-bottom:1px solid var(--line2);display:flex;flex-direction:column;gap:12px}
.dsv-biz .hd{display:flex;align-items:baseline;gap:6px 10px;flex-wrap:wrap}
.dsv-biz .hd b{font-size:14px;font-weight:700}
.dsv-biz .hd span{margin-left:auto;font-size:12px;color:var(--mute)}
.dsv-tot{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:12px;overflow:hidden;cursor:pointer;background:var(--line)}
.dsv-tot:hover{border-color:#C7D2FE}
.dsv-tot .g{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:1px}
.dsv-tot .c{background:#fff;padding:10px 12px;display:flex;flex-direction:column;gap:2px;min-width:0}
.dsv-tot .c .l{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.dsv-tot .c .v{font-size:17px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsv-tot .c .s{font-size:11px;color:var(--mute)}
.dsv-tot .f{background:#F8FAFC;border-top:1px solid var(--line);padding:7px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:var(--ink3)}
.dsv-tot .f b{font-weight:600;color:var(--blue2);white-space:nowrap}
.dsv-top3{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
.dsv-svcc{background:#F5F7FF;border:1px solid #C7D2FE;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;min-width:0}
.dsv-svcc .a{display:flex;align-items:center;justify-content:space-between;gap:8px}
.dsv-svcc .tag{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 8px;border-radius:999px}
.dsv-svcc .dt{font-size:12px;color:var(--mute)}
.dsv-svcc .b{display:flex;align-items:baseline;justify-content:space-between;gap:4px 10px;flex-wrap:wrap;font-size:14px;font-weight:700}
.dsv-svcc .c{display:flex;flex-direction:column;gap:1px;padding-top:8px;border-top:1px dashed #C7D2FE}
.dsv-svcc .c span{font-size:11px;color:var(--ink3)}
.dsv-svcc .c b{font-size:17px;font-weight:700;color:var(--navy);font-variant-numeric:tabular-nums}
.dsv-svcc .c i{font-style:normal;font-size:11px;color:var(--mute)}
.dsv-roi{align-self:flex-start;padding:4px 10px;border-radius:999px;background:#FDECEC;border:1px solid #F5C2C2;display:flex;align-items:baseline;gap:6px}
.dsv-roi span{font-size:10px;font-weight:700;letter-spacing:.06em;color:#B91C1C}
.dsv-roi b{font-size:15px;font-weight:800;color:#B91C1C;font-variant-numeric:tabular-nums;white-space:nowrap}
.dsv-last{background:#F8FAFC;border:1px solid var(--line2);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.dsv-last .r{display:flex;align-items:baseline;justify-content:space-between;gap:4px 12px;flex-wrap:wrap}
.dsv-last .cap{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.dsv-last .r b{font-size:15px;font-weight:700}
.dsv-last .after{display:flex;align-items:center;gap:10px;padding-top:10px;border-top:1px dashed #DDE2E8}
.dsv-last .after .x{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.dsv-last .after .x span{font-size:12px;color:var(--ink3)}
.dsv-last .after .x b{font-size:18px;font-weight:700;color:var(--navy);font-variant-numeric:tabular-nums}
.dsv-last .after .x i{font-style:normal;font-size:11px;color:var(--mute)}
.dsv-plan{display:flex;justify-content:space-between;align-items:baseline;gap:4px 10px;flex-wrap:wrap;font-size:13px;font-weight:600}
.dsv-chart{display:flex;flex-direction:column;gap:5px}
.dsv-chart .bars{display:flex;align-items:flex-end;gap:3px;height:52px;border-bottom:1px solid var(--line)}
.dsv-chart .col{flex:1 1 0;min-width:0;height:100%;display:flex;align-items:flex-end;justify-content:center;gap:1px;cursor:pointer;border-radius:3px 3px 0 0;border:none;padding:0}
.dsv-chart .col:hover{background:#EEF2FF!important}
.dsv-chart .col i{border-radius:2px 2px 0 0}
.dsv-chart .labs{display:flex;gap:3px}
.dsv-chart .labs span{flex:1 1 0;min-width:0;text-align:center;font-size:9px}
.dsv-legend{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:11px;color:var(--mute)}
.dsv-legend span{display:flex;align-items:center;gap:5px}
.dsv-legend i{width:8px;height:8px;border-radius:2px}
.dsv-legend .tap{margin-left:auto;color:var(--faint)}
.dsv-selbox{border:1px solid #C7D2FE;background:#F5F7FF;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:10px;margin-top:4px}
.dsv-selbox .h{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700}
.dsv-selbox .h button{margin-left:auto;border:0;background:transparent;font:inherit;font-size:12px;font-weight:600;color:var(--ink3);cursor:pointer;padding:2px 4px}
.dsv-selbox .g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.dsv-selbox .g div{display:flex;flex-direction:column;gap:1px;min-width:0}
.dsv-selbox .g span{font-size:11px;color:var(--ink3)}
.dsv-selbox .g b{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}
.dsv-selbox .l{padding-top:10px;border-top:1px dashed #C7D2FE;display:flex;flex-direction:column;gap:1px}
.dsv-selbox .l span{font-size:11px;color:var(--ink3)}
.dsv-selbox .l b{font-size:13px;font-weight:700}
.dsv-visit{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-top:1px solid #F0F2F5}
.dsv-visit .rl{flex:none;width:42px;height:24px;border-radius:7px;font-size:11px;font-weight:700;display:grid;place-items:center}
.dsv-visit .vx{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
.dsv-visit .vx b{font-size:13px;font-weight:600}
.dsv-visit .ds{display:flex;gap:4px;flex-wrap:wrap}
.dsv-visit .ds span{height:22px;padding:0 8px;border-radius:6px;background:#F1F3F6;font-size:12px;color:var(--ink2);display:flex;align-items:center;white-space:nowrap;font-variant-numeric:tabular-nums}
.dsv-visit .ds em{font-style:normal;font-size:12px;color:var(--faint)}
.dsv-skel{height:14px;border-radius:7px;background:linear-gradient(90deg,#EEF0F3,#F6F7F9,#EEF0F3);background-size:200% 100%;animation:dsvShimmer 1.2s linear infinite}
@keyframes dsvShimmer{from{background-position:200% 0}to{background-position:-200% 0}}

/* ---- overlays: drawer, filter panel, modal, toast */
.dsv-ov{position:fixed;inset:0;z-index:70;background:rgba(15,23,42,.4);display:flex;justify-content:flex-end;align-items:flex-end;animation:dsvFade .15s ease-out}
.dsv-drawer{width:500px;max-width:100%;height:100%;background:#fff;display:flex;flex-direction:column;box-shadow:-20px 0 50px rgba(15,23,42,.18);animation:dsvDrawer .24s cubic-bezier(.2,.8,.2,1)}
@media (max-width:719px){.dsv-drawer{width:100%;height:92%;border-radius:22px 22px 0 0;animation:dsvSheet .24s cubic-bezier(.2,.8,.2,1)}}
.dsv-dh{flex:none;padding:18px 20px;border-bottom:1px solid var(--line2);display:flex;align-items:flex-start;gap:12px}
.dsv-dh .t{flex:1;display:flex;flex-direction:column;gap:2px}
.dsv-dh .t b{font-size:19px;font-weight:700}
.dsv-dh .xbtn{width:40px;height:40px;border-radius:11px;border:1px solid #E1E5EB;background:#fff;display:grid;place-items:center;cursor:pointer}
.dsv-db{position:relative;flex:1 1 auto;min-height:0;overflow-y:auto;padding:18px 20px;display:flex;flex-direction:column;gap:18px}
.dsv-df{flex:none;padding:12px 16px;border-top:1px solid var(--line2);display:flex;gap:8px;align-items:center}
.dsv-df .p{flex:1;font-size:12px;color:var(--mute)}
.dsv-field{display:flex;flex-direction:column;gap:6px;position:relative}
.dsv-field>.lab{font-size:13px;font-weight:500;color:var(--ink2)}
.dsv-field>.lab i{font-style:normal;color:var(--red)}
.dsv-field .er{font-size:12px;color:var(--red)}
.dsv-locked{display:flex;align-items:center;gap:10px;min-height:56px;padding:8px 12px;border:1px solid var(--line);border-radius:12px;background:#F8FAFC}
.dsv-av{width:34px;height:34px;flex:none;border-radius:50%;background:#EAF1FF;color:var(--navy);font-size:12px;font-weight:700;display:grid;place-items:center}
.dsv-locked .x{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.dsv-locked .x b{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsv-locked .x span{font-size:12px;color:var(--mute)}
.dsv-locked .lk{flex:none;display:flex;align-items:center;gap:4px;font-size:11px;color:var(--mute)}
.dsv-mini{border:1px solid var(--line);border-radius:12px;overflow:hidden}
.dsv-mini .h{padding:8px 12px;background:#F8FAFC;border-bottom:1px solid var(--line2);display:flex;justify-content:space-between;gap:4px 8px;flex-wrap:wrap;font-size:11px;color:var(--mute)}
.dsv-mini .h b{font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.dsv-mini .g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--line2)}
.dsv-mini .g div{background:#fff;padding:9px 12px;display:flex;flex-direction:column;gap:1px;min-width:0}
.dsv-mini .g span{font-size:11px;color:var(--mute)}
.dsv-mini .g b{font-size:16px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsv-mini .f{padding:7px 12px;font-size:12px;color:var(--ink3);border-top:1px solid var(--line2)}
.dsv-cats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.dsv-cat{height:46px;border-radius:11px;border:1.5px solid #D7DCE3;background:#fff;color:var(--ink2);font-size:14px;font-weight:600;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:background-color .15s ease,border-color .15s ease}
.dsv-cat span{font-size:10px;font-weight:500;color:var(--faint)}
.dsv-cat.on{background:#EAF1FF;color:var(--blue2);border-color:var(--blue)}
.dsv-cat.on span{color:var(--blue)}
.dsv-trig{width:100%;height:46px;border:1px solid #D7DCE3;border-radius:12px;padding:0 12px;background:#fff;display:flex;align-items:center;gap:10px;cursor:pointer;text-align:left;transition:border-color .15s ease,box-shadow .15s ease}
.dsv-trig:hover{border-color:#B9C6D8}
.dsv-trig.open{border-color:var(--blue);box-shadow:0 0 0 3px rgba(37,99,235,.14)}
.dsv-trig.bad{border-color:#E5484D}
.dsv-trig .v{flex:1;min-width:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsv-trig .v.ph{color:var(--mute)}
.dsv-trig .v.set{font-weight:600;color:var(--ink)}
.dsv-trig .rel{flex:none;font-size:12px;color:var(--mute)}
.dsv-catch{position:fixed;inset:0;z-index:40}
.dsv-pop{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:41;background:#fff;border:1px solid #E1E5EB;border-radius:14px;box-shadow:0 18px 44px rgba(15,23,42,.18);overflow:hidden;animation:dsvIn .14s ease-out}
.dsv-pop .sr{padding:8px;border-bottom:1px solid var(--line2)}
.dsv-pop .sr label{height:42px;display:flex;align-items:center;gap:8px;padding:0 12px;background:var(--bg);border-radius:10px}
.dsv-pop .sr input{flex:1;min-width:0;border:none;outline:none;background:transparent;font-size:14px}
.dsv-pop .sr em{font-style:normal;font-size:11px;color:var(--faint);white-space:nowrap}
.dsv-pop .ls{max-height:min(264px,42vh);overflow-y:auto;padding:6px}
.dsv-opt{width:100%;min-height:44px;border:none;border-radius:10px;background:transparent;display:flex;align-items:center;gap:10px;padding:6px 10px;cursor:pointer;text-align:left}
.dsv-opt.hi{background:#F1F5FD}
.dsv-opt .x{flex:1;min-width:0;display:flex;flex-direction:column}
.dsv-opt .x b{font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsv-opt .x span{font-size:12px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsv-opt .u{font-size:11px;color:var(--mute);background:#F1F3F6;border-radius:6px;padding:2px 6px;white-space:nowrap}
.dsv-none{padding:22px 12px;text-align:center;font-size:13px;color:var(--mute)}
.dsv-row2{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}
.dsv-cal{position:absolute;left:0;top:76px;z-index:41;width:300px;max-width:calc(100vw - 56px);background:#fff;border:1px solid #E1E5EB;border-radius:16px;box-shadow:0 18px 44px rgba(15,23,42,.18);padding:12px;display:flex;flex-direction:column;gap:8px;animation:dsvIn .14s ease-out}
.dsv-cal .mh{display:flex;align-items:center;gap:6px}
.dsv-cal .mh b{flex:1;text-align:center;font-size:15px;font-weight:700}
.dsv-cal .mh button{width:34px;height:34px;border:none;border-radius:10px;background:var(--bg);display:grid;place-items:center;cursor:pointer}
.dsv-cal .gr{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px}
.dsv-cal .wk{height:24px;display:grid;place-items:center;font-size:11px;font-weight:600;color:var(--faint)}
.dsv-cal .dy{height:36px;border-radius:10px;border:1.5px solid transparent;background:transparent;color:var(--ink);font-size:13px;font-weight:500;cursor:pointer;font-variant-numeric:tabular-nums}
.dsv-cal .dy.today{border-color:#93B4F8;font-weight:700}
.dsv-cal .dy.on{background:var(--navy);color:#fff;font-weight:700}
.dsv-cal .dy:disabled{color:#D1D5DB;cursor:default}
.dsv-cal .qk{display:flex;gap:6px;padding-top:8px;border-top:1px solid var(--line2)}
.dsv-cal .qk button{flex:1;height:32px;border:none;border-radius:8px;background:var(--bg);color:var(--ink2);font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}
.dsv-cal .qk button.on{background:#EAF1FF;color:var(--blue2)}
.dsv-amt{height:46px;border:1px solid #D7DCE3;border-radius:11px;padding:0 12px;display:flex;align-items:center;gap:6px;background:#fff}
.dsv-amt.bad{border-color:#E5484D}
.dsv-amt span{color:var(--mute);font-size:14px}
.dsv-amt input{border:none;outline:none;font-size:15px;font-weight:600;flex:1;min-width:0;font-variant-numeric:tabular-nums;background:transparent}
.dsv-auto{background:#F6F7F9;border-radius:12px;padding:12px 14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px 16px}
.dsv-auto div{display:flex;flex-direction:column;gap:2px;min-width:0}
.dsv-auto span{font-size:11px;color:var(--mute)}
.dsv-auto b{font-size:13px;font-weight:500;overflow-wrap:anywhere}
.dsv-drop{border:1.5px dashed #C9D1DC;border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:10px;font-size:13px;color:var(--ink3);background:#FAFBFC;cursor:pointer}
.dsv-drop.on{border-color:var(--blue);background:#EEF4FF}
.dsv-drop b{color:var(--blue2);font-weight:600}
.dsv-ovc{position:fixed;inset:0;z-index:75;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:16px;animation:dsvFade .15s ease-out}
@media (max-width:719px){.dsv-ovc{align-items:flex-end;padding:0}}
.dsv-modal{width:100%;max-width:460px;background:#fff;border-radius:18px;padding:22px;display:flex;flex-direction:column;gap:14px;box-shadow:0 24px 60px rgba(15,23,42,.3);animation:dsvIn .2s ease-out}
@media (max-width:719px){.dsv-modal{border-radius:22px 22px 0 0}}
.dsv-modal .t{font-size:18px;font-weight:700;overflow-wrap:anywhere}
.dsv-modal .d{font-size:14px;color:var(--ink3);line-height:1.5}
.dsv-modal .q{display:flex;gap:6px;flex-wrap:wrap}
.dsv-modal .q button{height:32px;padding:0 10px;border-radius:8px;border:1px solid #E1E5EB;background:#F8FAFC;font-size:12px;color:var(--ink2);cursor:pointer}
.dsv-modal .q button:hover{background:#EEF1F5}
.dsv-modal .b{display:flex;gap:8px;justify-content:flex-end}
.dsv-fp{width:100%;max-width:640px;height:min(560px,calc(100% - 64px));background:#fff;border-radius:18px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(15,23,42,.3);animation:dsvIn .2s ease-out}
@media (max-width:719px){.dsv-fp{height:86%;border-radius:22px 22px 0 0;animation:dsvSheet .24s cubic-bezier(.2,.8,.2,1)}}
.dsv-fp .h{flex:none;display:flex;align-items:center;gap:8px;padding:12px 12px 12px 18px;border-bottom:1px solid var(--line2)}
.dsv-fp .h b{flex:1;font-size:17px;font-weight:700}
.dsv-fp .h .ap{height:40px;padding:0 16px;border:none;border-radius:10px;background:#0F172A;color:#fff;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
.dsv-fp .bd{flex:1 1 auto;min-height:0;display:flex}
.dsv-fp .nv{width:170px;flex:none;background:#F8FAFC;border-right:1px solid var(--line2);padding:8px;display:flex;flex-direction:column;gap:2px;overflow-y:auto}
@media (max-width:719px){.dsv-fp .nv{width:116px}}
.dsv-fp .nv button{min-height:44px;border:none;border-radius:10px;background:transparent;color:var(--ink2);font-size:14px;font-weight:500;padding:0 10px;display:flex;align-items:center;gap:6px;cursor:pointer;text-align:left}
.dsv-fp .nv button.on{background:#E8EFFC;color:var(--blue2);font-weight:600}
.dsv-fp .nv button span{flex:1;min-width:0}
.dsv-fp .op{flex:1;min-width:0;overflow-y:auto;padding:14px 12px 16px;display:flex;flex-direction:column;gap:4px}
.dsv-fp .op>.cap{font-size:11px;font-weight:600;letter-spacing:.08em;color:var(--mute);text-transform:uppercase;padding:0 6px 6px}
.dsv-fopt{min-height:44px;border:none;border-radius:10px;background:transparent;padding:6px 8px;display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left}
.dsv-fopt:hover{background:var(--bg)}
.dsv-fopt.on{background:#F5F8FF}
.dsv-fopt .rd{width:18px;height:18px;flex:none;border-radius:50%;border:1.5px solid #C5CCD6;display:grid;place-items:center}
.dsv-fopt .ck{width:18px;height:18px;flex:none;border-radius:5px;border:1.5px solid #C5CCD6;background:#fff;display:grid;place-items:center}
.dsv-fopt.on .rd,.dsv-fopt.on .ck{border-color:var(--blue)}
.dsv-fopt.on .ck{background:var(--blue)}
.dsv-fopt .x{flex:1;min-width:0;display:flex;flex-direction:column}
.dsv-fopt .x b{font-size:14px;font-weight:400;overflow-wrap:anywhere}
.dsv-fopt.on .x b{font-weight:600}
.dsv-fopt .x span{font-size:12px;color:var(--mute)}
.dsv-fopt .n{font-size:12px;color:var(--mute);font-variant-numeric:tabular-nums}
.dsv-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:90;background:#111827;color:#fff;font-size:13px;font-weight:500;padding:8px 16px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.25);max-width:calc(100% - 32px);width:max-content;display:flex;align-items:center;gap:12px;min-height:44px;animation:dsvIn .18s ease-out}
.dsv-toast.bad{background:#7F1D1D}

/* ---- doctor page: services card */
.dsv-svcard{background:#fff;border:1px solid var(--line);border-radius:18px;padding:14px 18px;display:flex;flex-direction:column;gap:6px}
.dsv-svcard .h{display:flex;align-items:center;gap:10px}
.dsv-svcard .h b{font-size:14px;font-weight:700;color:var(--navy)}
.dsv-svcard .h i{flex:1;height:1px;background:var(--line2)}
.dsv-svcard .h span{font-size:12px;color:var(--mute)}
.dsv-svrow{display:flex;align-items:center;gap:6px 12px;flex-wrap:wrap;padding:9px 0;border-top:1px solid #F0F2F5;font-size:13px}
.dsv-svrow .d{width:92px;flex:none;color:var(--mute);font-variant-numeric:tabular-nums}
.dsv-svrow .m{flex:1 1 140px;min-width:0;display:flex;flex-direction:column}
.dsv-svrow .m b{font-weight:600}
.dsv-svrow .m span{font-size:11px;color:var(--mute)}
.dsv-svrow .a{min-width:84px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.dsv-svcard .more{align-self:flex-start;border:none;background:none;color:var(--blue2);font-size:13px;font-weight:600;cursor:pointer;padding:4px 0}
`;

const STYLE_ID = 'elbrit-doctor-service-styles';

export function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}
