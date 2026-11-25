'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Icon, cx } from '@/design-system';
import { mapDist, mapIsPoint, mapMeters } from '../data/shape';
import { loadMaps } from './MapLocation';

/* 25 Nov 2026 · TO REVIEW — the ABM / RBM side of the Map location question,
 * as the ERP's My Surveys "To review" tab (survey-center-update/src/page/ms-review.js).
 *
 * Anyone above the rep in reports_to sees the hospital / clinic their team
 * chose (survey_map_review, action=list) and accepts or rejects it
 * (action=decide). Accept writes the new point to the doctor's record — for
 * now only on erp-uat (the ERP decides; `writes` says where); Reject keeps the
 * record and needs a note for the rep. */

const SAME = 50;
const goUrl = (p) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${(+p.lat).toFixed(7)},${(+p.lng).toFixed(7)}`)}`;
const keyOf = (x) => `${x.response}|${x.question}`;
const when = (s) => {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

/* the list, for the strip's circle and the screen */
export function useMapReviews(api, enabled = true) {
  const [state, setState] = useState({ loaded: false, items: [], done: [], all: 0, writes: '', err: '' });
  const load = useCallback(async () => {
    if (!enabled || typeof api?.mapReview !== 'function') return;
    try {
      const [p, d] = await Promise.all([api.mapReview({ action: 'list', which: 'pending' }), api.mapReview({ action: 'list', which: 'done' })]);
      setState({ loaded: true, items: p?.items ?? [], done: d?.items ?? [], all: p?.all ?? 0, writes: p?.writes ?? '', err: '' });
    } catch (e) {
      setState((s) => ({ ...s, loaded: true, err: e?.message || 'Couldn’t load the reviews.' }));
    }
  }, [api, enabled]);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load };
}

/* the circle on the home strip — only for someone with something to review or already reviewed */
export function reviewTile(rv, { hrefBase = '/survey' } = {}) {
  if (!rv?.loaded || (!rv.items.length && !rv.done.length)) return null;
  const n = rv.items.length;
  return {
    id: 'survey-review',
    label: 'To review',
    href: `${hrefBase}/review`,
    icon: 'map-marker',
    statusIcon: n ? 'eye' : 'check-square',
    statusTone: n ? undefined : 'success',
    iconTone: n ? undefined : 'success',
    caption: n ? 'Locations' : 'Done',
    captionTone: n ? 'danger' : 'success',
    ...(n ? { count: n, countTone: 'danger' } : {}),
    segments: n ? [{ key: 'left', value: n, tone: 'danger', label: 'To review' }] : [{ key: 'done', value: 1, tone: 'success', label: 'All checked' }],
    ariaLabel: n ? `To review: ${n} location${n === 1 ? '' : 's'} your team chose` : 'To review: all checked',
  };
}

function GBtn({ href, label, main }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} (opens Google Maps)`}
      className={cx(
        'mt-1 inline-flex min-h-11 items-center gap-1.5 self-start rounded-lg border px-3.5 text-13 font-semibold',
        main ? 'border-brand bg-brand text-on-brand hover:bg-brand-hover' : 'border-line bg-surface text-brand-text hover:bg-brand-tint-weak',
      )}
    >
      <Icon name="map-marker" size="sm" />
      {label}
      <Icon name="external-link" size="var(--fs-10)" />
    </a>
  );
}

/* the saved point and the chosen place on one small map */
function BothMap({ api, a, was }) {
  const ref = useRef(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let gone = false;
    loadMaps(api)
      .then((gm) => {
        if (gone || !ref.current) return;
        const nw = mapIsPoint(a) ? { lat: +a.lat, lng: +a.lng } : null;
        const map = new gm.Map(ref.current, { center: nw || was, zoom: 16, streetViewControl: false, mapTypeControl: true, mapTypeControlOptions: { mapTypeIds: ['roadmap', 'hybrid'] }, gestureHandling: 'cooperative', clickableIcons: false });
        const b = new gm.LatLngBounds();
        if (was) {
          new gm.Marker({ map, position: was, title: 'Saved location', zIndex: 1, icon: { path: gm.SymbolPath.CIRCLE, scale: 8, fillColor: '#475069', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 3 } });
          b.extend(was);
        }
        if (nw && a.how !== 'same') {
          new gm.Marker({ map, position: nw, title: a.name || 'BE chose', zIndex: 2, icon: { url: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png', scaledSize: new gm.Size(40, 40) } });
          b.extend(nw);
        }
        if (was && nw && mapMeters(was, nw) > 30) map.fitBounds(b, 60);
        else map.setZoom(18);
      })
      .catch((e) => !gone && setErr(e?.message || 'The map could not load.'));
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="flex flex-col gap-1.5">
      <div ref={ref} role="region" aria-label="Map: the saved location and the place the BE chose" className="h-60 overflow-hidden rounded-lg border border-line bg-sunken">
        {err ? <p className="p-4 text-center text-12 text-ds-muted">{err}</p> : null}
      </div>
      <div className="flex gap-4 text-12 text-body">
        {was ? (
          <span className="flex items-center gap-1.5">
            <i className="inline-block size-3 rounded-full bg-[#475069]" />
            Saved location
          </span>
        ) : null}
        {a.how !== 'same' ? (
          <span className="flex items-center gap-1.5">
            <i className="inline-block size-3 rounded-full bg-[#34A853]" />
            BE chose
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Card({ x, done, api, busy, onDecide }) {
  const a = x.answer || {};
  const was = mapIsPoint(a.was) ? { lat: +a.was.lat, lng: +a.was.lng } : null;
  const rv = x.review || {};
  const sub = x.subject || {};
  const moved = was && mapIsPoint(a) && a.how !== 'same' ? mapMeters(was, { lat: +a.lat, lng: +a.lng }) : null;
  const same = a.how === 'same' || (moved != null && moved <= SAME);
  const [showMap, setShowMap] = useState(false);
  const [rej, setRej] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const noteRef = useRef(null);
  useEffect(() => {
    if (rej) noteRef.current?.focus();
  }, [rej]);

  const badge =
    rv.status === 'Accepted' ? (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-success-wash px-2.5 py-1 text-12 font-semibold text-success">
        <Icon name="check-circle" size="sm" />
        Accepted
      </span>
    ) : rv.status === 'Rejected' ? (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-danger-wash px-2.5 py-1 text-12 font-semibold text-danger-text">
        <Icon name="times-circle" size="sm" />
        Rejected
      </span>
    ) : (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-warning-wash px-2.5 py-1 text-12 font-semibold text-pending-text">
        <Icon name="clock" size="sm" />
        To review
      </span>
    );

  const chose = (
    <div className={cx('flex min-w-0 flex-col gap-1 rounded-lg border px-3.5 py-3 [overflow-wrap:anywhere]', done ? 'border-line bg-sunken' : 'border-brand-tint bg-brand-tint-weak shadow-[inset_3px_0_0_var(--color-brand)]')}>
      <span className="flex items-center gap-1 text-12 font-semibold uppercase tracking-wide text-ds-muted">
        <Icon name="user" size="var(--fs-10)" />
        BE chose
      </span>
      {a.kind ? <span className="self-start rounded-full bg-brand-tint-weak px-2 py-0.5 text-12 font-semibold text-brand-text">{a.kind}</span> : null}
      <span className="text-14 font-semibold text-heading">{a.name || 'Place'}</span>
      {a.address ? <span className="text-13 text-ds-muted">{a.address}</span> : null}
      <GBtn href={a.url || (mapIsPoint(a) ? goUrl(a) : '')} label="Open on Google Maps" main={!done} />
    </div>
  );

  const decide = async (decision) => {
    if (decision === 'reject' && !note.trim()) {
      setErr('Write why it is wrong, so the rep can fix it.');
      noteRef.current?.focus();
      return;
    }
    setErr('');
    try {
      await onDecide(x, decision, note.trim());
    } catch (e) {
      setErr(e?.message || 'Couldn’t save. Please try again.');
    }
  };

  return (
    <article className={cx('flex flex-col rounded-xl bg-surface p-4 shadow-card', done ? 'gap-2.5' : 'gap-3')}>
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-tint-weak text-brand-text" aria-hidden="true">
          <Icon name={sub.doctype === 'Lead' || !sub.doctype ? 'user' : 'map-marker'} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-16 font-semibold text-heading [overflow-wrap:anywhere]">{sub.label || sub.name || 'Record'}</span>
          <span className="text-13 text-ds-muted">{[sub.code || sub.name, sub.hq].filter(Boolean).join(' · ')}</span>
        </span>
        {badge}
      </div>
      <p className="flex items-center gap-1.5 text-13 text-ds-muted">
        <Icon name="user" size="sm" className="shrink-0" />
        <span>
          <b className="font-semibold text-body">{x.rep}</b> · {x.title}
          {x.submitted_on ? ` · ${when(x.submitted_on)}` : ''}
        </span>
      </p>

      {done ? (
        <>
          {chose}
          <div className={cx('flex flex-col gap-1.5 rounded-lg px-3 py-2.5 text-13 font-semibold', rv.status === 'Accepted' ? 'bg-success-wash text-success' : 'bg-danger-wash text-danger-text')}>
            <span className="flex items-center gap-1.5">
              <Icon name={rv.status === 'Accepted' ? 'check-circle' : 'times-circle'} size="sm" />
              {`${rv.status || ''} by ${rv.by_name || rv.by || ''}${rv.at ? ` · ${when(rv.at)}` : ''}`}
            </span>
            {rv.note ? <span className="font-normal italic text-body">“{rv.note}”</span> : null}
            {rv.status === 'Accepted' ? (
              <span className="flex items-center gap-1.5 font-normal text-body">
                <Icon name={rv.applied?.done ? 'database' : 'info-circle'} size="sm" />
                {rv.applied?.done ? 'The doctor’s latitude / longitude were updated (erp-uat).' : rv.applied?.why || 'The record was not changed.'}
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <p className="text-16 font-semibold text-body">{x.label || 'Location'}</p>
          {!was ? (
            <div className="flex items-start gap-2 rounded-lg bg-brand-tint-weak px-3 py-2.5 text-14 text-brand-text">
              <Icon name="plus-circle" size="sm" className="mt-0.5 shrink-0" />
              <span>
                <b>New location</b> — this doctor had none saved. Accept saves it.
              </span>
            </div>
          ) : same ? (
            <div className="flex items-start gap-2 rounded-lg bg-success-wash px-3 py-2.5 text-14 text-success">
              <Icon name="check-circle" size="sm" className="mt-0.5 shrink-0" />
              <span>
                <b>Same place as the saved location</b> ({Math.round(moved || 0)} m) — the latitude / longitude stay as they are.
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-lg bg-warning-wash px-3 py-2.5 text-14 text-pending-text">
              <Icon name="arrows-alt" size="sm" className="mt-0.5 shrink-0" />
              <span>
                <b>Moved {mapDist(moved || 0)}</b> from the saved location — Accept updates the doctor’s latitude / longitude.
              </span>
            </div>
          )}

          <div className={cx('grid gap-2.5', was ? '@lg/survey:grid-cols-2' : '')}>
            {was ? (
              <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface px-3.5 py-3 [overflow-wrap:anywhere]">
                <span className="flex items-center gap-1 text-12 font-semibold uppercase tracking-wide text-ds-muted">
                  <Icon name="history" size="var(--fs-10)" />
                  Saved location now
                </span>
                {a.was_place?.id ? (
                  <>
                    <span className="text-14 font-semibold text-heading">{a.was_place.name || 'Place on Google Maps'}</span>
                    <span className="text-13 text-ds-muted">On Google Maps at the saved point{a.was_place.dist != null ? ` (${mapDist(+a.was_place.dist)})` : ''}</span>
                    <GBtn href={a.was_place.url || goUrl(was)} label="Open on Google Maps" />
                  </>
                ) : (
                  <>
                    <span className="text-13 italic text-ds-muted">No hospital or clinic on Google Maps at this point</span>
                    <GBtn href={goUrl(was)} label="Open the point on Google Maps" />
                  </>
                )}
              </div>
            ) : null}
            {chose}
          </div>

          {showMap ? (
            <BothMap api={api} a={a} was={was} />
          ) : mapIsPoint(a) ? (
            <button
              type="button"
              onClick={() => setShowMap(true)}
              className="flex min-h-11 items-center gap-1.5 self-start rounded-lg border border-line bg-surface px-3 text-14 font-semibold text-brand-text hover:bg-brand-tint-weak"
            >
              <Icon name="map" size="sm" />
              {was && a.how !== 'same' ? 'Show both on the map' : 'Show on the map'}
            </button>
          ) : null}

          {err ? (
            <p role="alert" className="flex items-center gap-2 rounded-lg bg-danger-wash px-3 py-2.5 text-13 font-semibold text-danger-text">
              <Icon name="exclamation-circle" size="sm" />
              {err}
            </p>
          ) : null}

          {rej ? (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-14 font-semibold text-body">
                  Why is it wrong? <small className="text-13 font-normal text-ds-muted">The rep sees this note</small>
                </span>
                <textarea
                  ref={noteRef}
                  rows={3}
                  maxLength={1000}
                  value={note}
                  onChange={(e) => {
                    setNote(e.target.value);
                    setErr('');
                  }}
                  placeholder="e.g. That is the pharmacy next door — please choose the clinic"
                  className="min-h-[84px] rounded-lg border border-danger bg-surface px-3 py-2 text-16 text-body placeholder:text-placeholder focus:outline-none"
                />
              </label>
              <div className="flex gap-2.5">
                <Button type="default" size="app" disabled={busy} onClick={() => setRej(false)} className="basis-1/3">
                  Cancel
                </Button>
                <Button type="primary" danger size="app" loading={busy === 'reject'} disabled={Boolean(busy)} onClick={() => decide('reject')} className="flex-1">
                  Reject &amp; send note
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-2.5">
                <Button
                  type="default"
                  danger
                  size="app"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    setRej(true);
                    setErr('');
                  }}
                  className="basis-1/3"
                >
                  Reject
                </Button>
                <Button type="primary" size="app" loading={busy === 'accept'} disabled={Boolean(busy)} onClick={() => decide('accept')} className="flex-1">
                  {same ? 'Accept' : 'Accept & update'}
                </Button>
              </div>
              <p className="flex items-center justify-center gap-1.5 text-center text-13 text-ds-muted">
                <Icon name="info-circle" size="sm" />
                {same ? 'Accept keeps the doctor’s latitude / longitude as they are.' : was ? 'Accept writes the new place to the doctor’s record.' : 'Accept saves this place as the doctor’s location.'}
              </p>
            </>
          )}
        </>
      )}
    </article>
  );
}

/* The screen: what is waiting, then what was reviewed. */
export function MapReview({ api, reviews }) {
  const own = useMapReviews(api, !reviews);
  const rv = reviews ?? own;
  const [busy, setBusy] = useState({});
  const [toast, setToast] = useState('');

  const onDecide = async (x, decision, note) => {
    const k = keyOf(x);
    setBusy((b) => ({ ...b, [k]: decision }));
    try {
      const m = await api.mapReview({ action: 'decide', response: x.response, question: x.question, decision, note });
      setToast(
        decision === 'accept'
          ? m?.applied?.done
            ? 'Accepted — the doctor’s location is updated (erp-uat).'
            : `Accepted.${m?.applied?.why ? ` ${m.applied.why}` : ''}`
          : 'Rejected — the rep sees your note.',
      );
      window.setTimeout(() => setToast(''), 4000);
      await rv.reload();
    } finally {
      setBusy((b) => {
        const n = { ...b };
        delete n[k];
        return n;
      });
    }
  };

  if (!rv.loaded) {
    return (
      <div role="status" aria-label="Loading" className="flex flex-col gap-3">
        <div className="h-20 animate-pulse rounded-xl bg-sunken" />
        <div className="h-48 animate-pulse rounded-xl bg-sunken" />
      </div>
    );
  }
  const n = rv.items.length;
  return (
    <div className="flex flex-col gap-3">
      {rv.err ? (
        <p role="alert" className="flex items-center gap-2 rounded-lg bg-danger-wash px-3 py-2.5 text-13 font-semibold text-danger-text">
          <Icon name="exclamation-circle" size="sm" />
          {rv.err}
        </p>
      ) : null}
      <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-surface px-3.5 py-3">
        <b className="text-16 text-heading">{n ? `${n} location${n === 1 ? '' : 's'} to check` : 'All checked'}</b>
        <span className="text-13 text-ds-muted">
          {rv.all ? 'You can review every team’s locations. ' : 'Hospital / clinic locations your team chose. '}
          {rv.writes ? `Accepting updates the doctor’s record on ${rv.writes} only.` : 'Accepting is saved; the doctor’s record is not changed here yet.'}
        </span>
      </div>
      {n ? (
        rv.items.map((x) => <Card key={keyOf(x)} x={x} api={api} busy={busy[keyOf(x)]} onDecide={onDecide} />)
      ) : (
        <div className="flex flex-col items-center gap-1.5 rounded-xl bg-surface px-4 py-8 text-center">
          <Icon name="check-circle" size="lg" className="text-success" />
          <span className="text-14 font-semibold text-heading">Nothing to review</span>
          <span className="text-13 text-ds-muted">New locations from your team show up here.</span>
        </div>
      )}
      {rv.done.length ? (
        <>
          <h2 className="mt-3 text-13 font-semibold uppercase tracking-wide text-ds-muted">Reviewed · {rv.done.length}</h2>
          {rv.done.map((x) => (
            <Card key={keyOf(x)} x={x} api={api} done />
          ))}
        </>
      ) : null}
      {toast ? (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 max-w-[90%] -translate-x-1/2 rounded-lg bg-heading px-4 py-2.5 text-center text-13 text-surface shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

export default MapReview;
