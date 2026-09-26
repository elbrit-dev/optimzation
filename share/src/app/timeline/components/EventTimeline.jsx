'use client';

import React, { useMemo, useCallback } from 'react';
import { Timeline } from 'primereact/timeline';
import dayjs from 'dayjs';
import { orderBy } from 'lodash';

const SUBTYPE_ICONS = {
  pob: 'pi pi-box',
  emi: 'pi pi-credit-card',
  payslip: 'pi pi-file',
  roi: 'pi pi-percentage',
  note: 'pi pi-file-edit',
  visit: 'pi pi-heart',
};

const TYPE_ICONS = {
  activity: 'pi pi-calendar',
  financial: 'pi pi-wallet',
  performance: 'pi pi-chart-line',
};

function iconClassForEvent(item) {
  const sub = item?.subtype && String(item.subtype).toLowerCase();
  if (sub && SUBTYPE_ICONS[sub]) return SUBTYPE_ICONS[sub];
  const t = item?.type && String(item.type).toLowerCase();
  if (t && TYPE_ICONS[t]) return TYPE_ICONS[t];
  return 'pi pi-circle-fill';
}

function formatDataSummary(data) {
  if (!data || typeof data !== 'object') return null;
  const parts = [];
  if (data.amount != null) parts.push(`Amount: ${data.amount}${data.status ? ` · ${data.status}` : ''}`);
  if (data.qty != null && data.value != null)
    parts.push(`Qty ${data.qty} · Value ${data.value}${data.items != null ? ` · ${data.items} items` : ''}`);
  if (data.roi != null) parts.push(`ROI: ${data.roi}`);
  if (data.salary != null)
    parts.push(
      `Salary: ${data.salary}${data.month ? ` · ${data.month}` : ''}${data.year != null ? ` ${data.year}` : ''}`
    );
  if (data.description != null && String(data.description).trim()) {
    const d = String(data.description).trim();
    parts.push(d.length > 120 ? `${d.slice(0, 117)}…` : d);
  }
  if (parts.length === 0) {
    const keys = Object.keys(data);
    if (keys.length === 0) return null;
    return keys.slice(0, 3).map((k) => `${k}: ${JSON.stringify(data[k])}`).join(' · ');
  }
  return parts.join(' · ');
}

function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.id;
  const date = raw.date;
  if (id == null || date == null || date === '') return null;
  /** @type {true | false | undefined} */
  let clickablePref;
  if (raw.clickable === true) clickablePref = true;
  else if (raw.clickable === false) clickablePref = false;
  else clickablePref = undefined;
  return {
    ...raw,
    id: String(id),
    date: String(date),
    title: raw.title != null ? String(raw.title) : '',
    type: raw.type != null ? String(raw.type) : '',
    subtype: raw.subtype != null ? String(raw.subtype) : '',
    data: raw.data != null && typeof raw.data === 'object' ? raw.data : {},
    meta: raw.meta != null && typeof raw.meta === 'object' ? raw.meta : {},
    clickable: clickablePref,
  };
}

/** PrimeReact vertical timeline uses align names opposite to “which side the cards sit on”. */
function toPrimeTimelineAlign(align) {
  const a = align != null ? String(align).toLowerCase() : 'alternate';
  if (a === 'left') return 'right';
  if (a === 'right') return 'left';
  if (a === 'alternate') return 'alternate';
  return 'alternate';
}

function isSingleSideAlign(align) {
  const a = align != null ? String(align).toLowerCase() : 'alternate';
  return a === 'left' || a === 'right';
}

/**
 * @param {object} props
 * @param {Array<object>} props.events
 * @param {'left'|'right'|'alternate'} [props.align] — side the **content cards** sit on
 * @param {(args: { timelineEvent: object, clickSource: 'marker'|'card' }) => void} [props.onEventClick] — when set, only items with `clickable: true` receive clicks. Missing or false `clickable` is non-interactive. Without `onEventClick`, nothing is interactive.
 * @param {string} [props.className]
 */
export default function EventTimeline({ events = [], align = 'alternate', onEventClick, className = '' }) {
  const sortedEvents = useMemo(() => {
    const list = Array.isArray(events) ? events : [];
    const normalized = list.map(normalizeEvent).filter(Boolean);
    const resolved = normalized.map((e) => ({
      ...e,
      clickable: e.clickable === true,
    }));
    return orderBy(resolved, [(e) => e.date], ['asc']);
  }, [events]);

  const primeAlign = useMemo(() => toPrimeTimelineAlign(align), [align]);
  const isSingleSide = useMemo(() => isSingleSideAlign(align), [align]);

  const rootClass = [
    'elbrit-event-timeline max-w-3xl',
    isSingleSide ? 'elbrit-event-timeline--single-side w-fit' : 'w-full',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handleItemClick = useCallback(
    (item, clickSource) => {
      if (typeof onEventClick !== 'function') return;
      if (!item?.clickable) return;
      onEventClick({ timelineEvent: item, clickSource });
    },
    [onEventClick]
  );

  if (sortedEvents.length === 0) {
    return (
      <div className={`${rootClass} rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500 text-sm`}>
        <i className="pi pi-inbox text-3xl text-gray-300 mb-2 block" aria-hidden />
        No events to display. Pass a non-empty <code className="text-gray-700">events</code> array.
      </div>
    );
  }

  const markerClassName =
    'elbrit-event-timeline__marker flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-blue-500 bg-blue-50 text-blue-600';

  const marker = (item) => {
    if (item == null || typeof item !== 'object') return null;
    const icon = <i className={`${iconClassForEvent(item)} text-lg`} aria-hidden />;
    const interactive = typeof onEventClick === 'function' && item?.clickable === true;
    if (interactive) {
      return (
        <button
          type="button"
          className={`${markerClassName} cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2`}
          aria-label={item.title ? `Event: ${item.title}` : 'Event marker'}
          onClick={(e) => {
            e.stopPropagation();
            handleItemClick(item, 'marker');
          }}
        >
          {icon}
        </button>
      );
    }
    return (
      <span className={markerClassName} aria-hidden>
        {icon}
      </span>
    );
  };

  const content = (item) => {
    if (item == null || typeof item !== 'object') return null;
    const formatted = dayjs(item.date).isValid() ? dayjs(item.date).format('MMM D, YYYY · h:mm A') : item.date;
    const summary = formatDataSummary(item.data);
    const interactive = typeof onEventClick === 'function' && item?.clickable === true;
    const cardClass = [
      'rounded-lg border border-gray-100 bg-white p-3 shadow-sm',
      interactive
        ? 'cursor-pointer transition-[box-shadow,transform,border-color] duration-150 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md hover:border-gray-200 active:translate-y-0 active:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    const onCardKeyDown = interactive
      ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleItemClick(item, 'card');
          }
        }
      : undefined;

    return (
      <div
        className={cardClass}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={interactive ? () => handleItemClick(item, 'card') : undefined}
        onKeyDown={onCardKeyDown}
      >
        <div className="font-semibold text-gray-900">{item.title || 'Untitled'}</div>
        <div className="mt-1 text-xs text-gray-500">{formatted}</div>
        {summary ? <div className="mt-2 text-sm text-gray-600">{summary}</div> : null}
      </div>
    );
  };

  return (
    <Timeline
      className={rootClass}
      value={sortedEvents}
      dataKey="id"
      align={primeAlign}
      marker={marker}
      content={content}
    />
  );
}
