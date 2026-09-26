'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Icon, SegmentedControl, cx } from '@/design-system';

/* Widths, and the device each stands for. Heights are the real devices'
   (CSS px): iPhone SE / Android / iPhone 14 / 14 Pro Max, iPad portrait,
   iPad landscape, a laptop browser window. */
export const VIEWPORTS = [
  { id: 'fit', label: 'Fit', width: null },
  { id: '320', label: '320', width: 320, height: 568 },
  { id: '360', label: '360', width: 360, height: 780 },
  { id: '390', label: '390', width: 390, height: 844 },
  { id: '430', label: '430', width: 430, height: 932 },
  { id: '768', label: '768', width: 768, height: 1024 },
  { id: '1024', label: '1024', width: 1024, height: 768 },
  { id: '1280', label: '1280', width: 1280, height: 800 },
];
const MIN = 260;
const MAX = 2560;

export function deviceKind(width) {
  if (width == null) return 'fit';
  if (width <= 480) return 'phone';
  if (width <= 1100) return 'tablet';
  return 'desktop';
}

function nominalHeight(width) {
  const preset = VIEWPORTS.find((v) => v.width === width);
  if (preset?.height) return preset.height;
  const kind = deviceKind(width);
  return kind === 'phone' ? Math.round(width * 2.16) : kind === 'tablet' ? Math.round(width * 1.33) : Math.round(width * 0.625);
}

/* The chrome around the screen, per device: [top bar height, bezel]. */
const CHROME = { phone: { bar: 44, bezel: 12 }, tablet: { bar: 24, bezel: 14 }, desktop: { bar: 38, bezel: 0 } };

/* THE STATUS BAR TELLS THE TRUTH — this machine's clock, battery and
   connection, not a picture of 9:41 and full bars:
     time      the local clock, ticking on the minute
     battery   navigator.getBattery() (Chromium): level, charging, low ≤ 20%;
               where the browser will not say, a full outline
     signal    navigator.connection's effectiveType (slow-2g…4g → 1–4 bars),
               Wi-Fi when the connection says so; offline empties the bars.
   Read after mount only — the server render has none of them. */
const SIGNAL_BARS = { 'slow-2g': 1, '2g': 2, '3g': 3, '4g': 4 };

function useDeviceStatus() {
  const [status, setStatus] = useState({ time: null, battery: null, bars: 4, wifi: false, online: true, net: null });
  useEffect(() => {
    let alive = true;
    const set = (patch) => alive && setStatus((s) => ({ ...s, ...patch }));

    const clock = () => set({ time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '') });
    clock();
    let tick = null;
    const align = setTimeout(() => {
      clock();
      tick = setInterval(clock, 60_000);
    }, 60_000 - (Date.now() % 60_000));

    const conn = navigator.connection;
    const network = () =>
      set({
        online: navigator.onLine,
        bars: SIGNAL_BARS[conn?.effectiveType] ?? 4,
        wifi: conn?.type === 'wifi' || conn?.type === 'ethernet',
        net: conn?.effectiveType ?? null,
      });
    network();
    conn?.addEventListener?.('change', network);
    window.addEventListener('online', network);
    window.addEventListener('offline', network);

    let battery = null;
    const power = () => battery && set({ battery: { level: battery.level, charging: battery.charging } });
    navigator.getBattery?.().then((b) => {
      battery = b;
      power();
      b.addEventListener('levelchange', power);
      b.addEventListener('chargingchange', power);
    }).catch(() => {});

    return () => {
      alive = false;
      clearTimeout(align);
      clearInterval(tick);
      conn?.removeEventListener?.('change', network);
      window.removeEventListener('online', network);
      window.removeEventListener('offline', network);
      battery?.removeEventListener('levelchange', power);
      battery?.removeEventListener('chargingchange', power);
    };
  }, []);
  return status;
}

function SignalBars({ bars, online }) {
  return (
    <span className="flex h-[10px] items-end gap-[1.5px]" aria-hidden="true">
      {[1, 2, 3, 4].map((n) => (
        <span
          key={n}
          className={cx('w-[3px] rounded-[1px]', online && n <= bars ? 'bg-current' : 'bg-current opacity-25')}
          style={{ height: `${n * 25}%` }}
        />
      ))}
    </span>
  );
}

function Battery({ battery }) {
  const level = battery?.level ?? 1;
  const low = battery && !battery.charging && level <= 0.2;
  /* The level is written inside the battery, over a pale fill, as a phone
     does; charging adds a bolt beside the number. */
  return (
    <span className="relative inline-flex h-[12px] w-[26px] items-center justify-center rounded-[3.5px] border border-current">
      <span
        className={cx('absolute inset-y-[1px] left-[1px] rounded-[2px]', low ? 'bg-danger' : battery?.charging ? 'bg-success' : 'bg-current opacity-30')}
        style={{ width: `calc(${Math.max(level, 0.06) * 100}% - 2px)` }}
      />
      <span className="relative flex items-center text-[8px] font-bold leading-none tabular-nums">
        {battery ? Math.round(level * 100) : null}
        {battery?.charging ? (
          <svg viewBox="0 0 10 10" className="size-[7px] fill-current" aria-hidden="true">
            <path d="M6 0 1.5 5.6H4.6L3.8 10 8.5 4.2H5.4Z" />
          </svg>
        ) : null}
      </span>
      <span className="absolute -right-[3px] top-1/2 h-[4px] w-[2px] -translate-y-1/2 rounded-r-[1px] bg-current" />
    </span>
  );
}

function StatusBar({ kind }) {
  const status = useDeviceStatus();
  const label = [
    status.time,
    status.online ? (status.wifi ? 'Wi-Fi' : status.net ?? 'online') : 'offline',
    status.battery ? `battery ${Math.round(status.battery.level * 100)}%${status.battery.charging ? ', charging' : ''}` : null,
  ].filter(Boolean).join(' · ');
  if (kind === 'desktop') {
    return (
      <div className="flex h-[38px] shrink-0 items-center gap-2 border-b border-line-subtle bg-sunken px-3">
        <span className="size-3 rounded-full bg-[#ff5f57]" />
        <span className="size-3 rounded-full bg-[#febc2e]" />
        <span className="size-3 rounded-full bg-[#28c840]" />
        <span className="ml-3 flex-1 truncate rounded-md bg-surface px-3 py-0.5 text-11 text-ds-muted">app.elbrit.org</span>
      </div>
    );
  }
  const phone = kind === 'phone';
  return (
    <div
      title={label}
      className={cx('relative flex shrink-0 items-center justify-between bg-surface px-6 text-12 font-semibold text-heading', phone ? 'h-[44px]' : 'h-[24px] px-4 text-10')}
    >
      <span className="tabular-nums" suppressHydrationWarning>{status.time ?? ''}</span>
      {phone ? <span className="absolute left-1/2 top-2 h-[26px] w-[96px] -translate-x-1/2 rounded-full bg-[#111]" aria-hidden="true" /> : null}
      <span className="flex items-center gap-1.5" aria-hidden="true">
        {status.online ? null : <span className="text-[10px] font-medium text-ds-muted">No service</span>}
        <SignalBars bars={status.bars} online={status.online} />
        {status.online && status.wifi ? <Icon name="wifi" size="sm" /> : null}
        <Battery battery={status.battery} />
      </span>
    </div>
  );
}

/* THE SCREEN, on the device it is meant for — a phone up to 480px, a tablet
   to 1100, a desktop browser window beyond; Fit has no frame. The device
   keeps its real WIDTH (the components size by container queries, so the
   width is what they read); its height is the device's, capped at the room
   there is, and the app scrolls inside the screen as it would on the device.
   Presets or drag the right edge (twice the pointer, as the device is
   centred); arrow keys nudge it. Remount re-creates the component.

   BARS PINNED TO THE SCREEN'S BOTTOM (Secondary Entry's and Approval's) are
   fixed to the window, so the screen tells them where it ends: the CSS
   variable --harness-bottom on the document is the gap between the device
   screen's bottom and the window's, and the entries' bottomGap adds it. */
export function Stage({ width, setWidth, surface, padded, onRemount, toolbar, children }) {
  const areaRef = useRef(null);
  const screenRef = useRef(null);
  const drag = useRef(null);
  const kind = deviceKind(width);
  const preset = width == null ? 'fit' : (VIEWPORTS.find((v) => v.width === width)?.id ?? null);

  /* The room the stage has, for capping the device height. */
  const [room, setRoom] = useState(800);
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return undefined;
    const update = () => setRoom(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Where the screen ends, for the pinned bars. */
  useEffect(() => {
    const root = document.documentElement;
    const el = screenRef.current;
    if (kind === 'fit' || !el) {
      root.style.setProperty('--harness-bottom', '0px');
      return () => root.style.removeProperty('--harness-bottom');
    }
    const update = () => {
      const r = el.getBoundingClientRect();
      root.style.setProperty('--harness-bottom', `${Math.max(0, Math.round(window.innerHeight - r.bottom))}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      root.style.removeProperty('--harness-bottom');
    };
  }, [kind, width, room]);

  const down = useCallback((e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: width ?? MIN };
  }, [width]);
  const move = useCallback(
    (e) => {
      if (!drag.current) return;
      setWidth(Math.min(Math.max(Math.round(drag.current.w + (e.clientX - drag.current.x) * 2), MIN), MAX));
    },
    [setWidth],
  );
  const up = useCallback((e) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    drag.current = null;
  }, []);

  const chrome = CHROME[kind];
  const screenHeight = kind === 'fit' ? null : Math.max(320, Math.min(nominalHeight(width), room - 48 - 2 * (chrome?.bezel ?? 0) - (chrome?.bar ?? 0)));
  const label = kind === 'fit' ? 'fits the window' : `${kind} · ${width}×${nominalHeight(width)}`;

  const screen = (
    <div
      ref={screenRef}
      data-surface={surface || undefined}
      data-testid="harness-frame"
      className={cx('ds-scrollbar relative min-w-0 bg-page', kind === 'fit' ? 'flex flex-col' : 'overflow-y-auto', padded && 'p-4')}
      style={kind === 'fit' ? { width: '100%' } : { width, height: screenHeight }}
    >
      {children}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line-subtle bg-surface px-3 py-1.5">
        <SegmentedControl
          items={VIEWPORTS.map(({ id, label: l }) => ({ id, label: l }))}
          value={preset ?? ''}
          onChange={(id) => setWidth(VIEWPORTS.find((v) => v.id === id)?.width ?? null)}
          ariaLabel="Viewport width"
        />
        <span className="text-11 tabular-nums text-ds-muted">{label}</span>
        <div className="ml-auto flex items-center gap-2">
          {toolbar}
          <Button type="default" size="sm" icon={<Icon name="refresh" size="sm" />} onClick={onRemount}>
            Remount
          </Button>
        </div>
      </div>
      <div ref={areaRef} className={cx('ds-scrollbar flex min-h-0 flex-1 overflow-auto bg-sunken', kind === 'fit' ? 'justify-center' : 'items-start p-6')}>
        {kind === 'fit' ? (
          screen
        ) : (
          /* Auto margins, not justify-center: centred when it fits, and scrollable
             from its left edge when it is wider than the room (a centred overflow
             cuts off the left side for good). */
          <div className="relative mx-auto shrink-0">
            <div
              className={cx(
                'flex flex-col overflow-hidden shadow-card',
                kind === 'phone' && 'rounded-[48px] border-[12px] border-[#1c1c1e] bg-[#1c1c1e]',
                kind === 'tablet' && 'rounded-[28px] border-[14px] border-[#1c1c1e] bg-[#1c1c1e]',
                kind === 'desktop' && 'rounded-[10px] border border-line bg-surface',
              )}
            >
              <div className={cx('flex flex-col overflow-hidden', kind === 'phone' && 'rounded-[36px]', kind === 'tablet' && 'rounded-[14px]')}>
                <StatusBar kind={kind} />
                {screen}
              </div>
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize viewport"
              aria-valuenow={width}
              aria-valuemin={MIN}
              aria-valuemax={MAX}
              tabIndex={0}
              className="absolute -right-4 top-1/2 h-16 w-2 -translate-y-1/2 cursor-ew-resize rounded-full bg-line-strong opacity-60 hover:opacity-100"
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 100 : 10;
                if (e.key === 'ArrowRight') setWidth(Math.min(width + step, MAX));
                if (e.key === 'ArrowLeft') setWidth(Math.max(width - step, MIN));
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
