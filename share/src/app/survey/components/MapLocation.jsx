'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon, cx } from '@/design-system';
import { mapIsPoint, mapMeters, mapMoved, mapStart, mapText, mapUrl } from '../data/shape';

/* 24 Nov 2026 · the Map location question (SURVEYS_CONTEXT.md §3).
 *
 * A Google map at the record's current point (q.lat / q.lng, filled from the
 * record's {#fields}). The rep keeps it ("This is correct"), searches the
 * exact Google place (the ERP's doctor_connect_places — the server key never
 * leaves the ERP), drags the pin / taps the map, or uses the phone's location.
 *
 * The answer: { lat, lng, place_id?, name?, address?, url?, how, was?, acc? },
 * how = same | place | pin | gps, was = the record's point before. The map
 * uses the ERP's browser key (survey_maps_key, as /doctor-connect does); if
 * Google refuses it, search and "My location" still work. */

let mapsPromise = null;
function loadMaps(api) {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  mapsPromise ??= (async () => {
    const m = typeof api?.mapsKey === 'function' ? await api.mapsKey() : null;
    const key = m?.key;
    if (!key) throw new Error('The map isn’t set up yet.');
    return new Promise((resolve, reject) => {
      window.__svMapsReady = () => resolve(window.google.maps);
      window.gm_authFailure = () => reject(new Error('Google Maps refused this site’s key — ask IT to allow this website on the browser key.'));
      const s = document.createElement('script');
      s.async = true;
      s.onerror = () => reject(new Error('Google Maps could not load. Check the internet connection.'));
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__svMapsReady&region=IN&language=en`;
      document.head.appendChild(s);
    });
  })();
  mapsPromise.catch(() => {
    mapsPromise = null;
  });
  return mapsPromise;
}

const INDIA = { lat: 20.6, lng: 78.9 };

export function MapLocation({ q, value, onChange, disabled, api }) {
  const start = mapStart(q);
  const cur = mapIsPoint(value) ? value : null;
  const pt = cur ? { lat: +cur.lat, lng: +cur.lng } : start;

  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const pinRef = useRef(null);
  const oldRef = useRef(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const [mapErr, setMapErr] = useState(null);
  const [term, setTerm] = useState('');
  const [places, setPlaces] = useState([]);
  const [searching, setSearching] = useState(false);
  const [findErr, setFindErr] = useState(null);
  const [locating, setLocating] = useState(false);

  /* one answer from a point; a pin nudged a few metres keeps the place's name */
  const set = (p, fromMap) => {
    if (disabledRef.current) return;
    const v = { lat: +(+p.lat).toFixed(7), lng: +(+p.lng).toFixed(7), how: p.how };
    for (const k of ['place_id', 'name', 'address', 'url', 'acc']) if (p[k] != null && p[k] !== '') v[k] = p[k];
    const old = valueRef.current;
    if (fromMap && mapIsPoint(old) && old.name && mapMeters(old, v) < 60) {
      v.name = old.name;
      if (old.address) v.address = old.address;
    }
    if (start) v.was = start;
    onChangeRef.current(v);
  };
  const setRef = useRef(set);
  setRef.current = set;

  /* the map, once */
  useEffect(() => {
    let gone = false;
    loadMaps(api)
      .then((gm) => {
        if (gone || !boxRef.current || mapRef.current) return;
        const map = new gm.Map(boxRef.current, {
          center: pt ?? INDIA,
          zoom: pt ? 17 : 5,
          mapTypeControl: true,
          mapTypeControlOptions: { mapTypeIds: ['roadmap', 'hybrid'] },
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
          gestureHandling: 'cooperative',
        });
        const pin = new gm.Marker({ map, draggable: true, title: 'Drag to the exact spot' });
        const old = new gm.Marker({ map, opacity: 0.45, clickable: false, title: 'Location on record' });
        pin.addListener('dragend', (e) => setRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng(), how: 'pin' }, true));
        map.addListener('click', (e) => setRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng(), how: 'pin' }, true));
        mapRef.current = map;
        pinRef.current = pin;
        oldRef.current = old;
        setMapErr(null);
        sync();
      })
      .catch((e) => !gone && setMapErr(e?.message || 'The map could not load.'));
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* the pins follow the answer */
  const sync = () => {
    const map = mapRef.current;
    if (!map) return;
    const v = valueRef.current;
    const p = mapIsPoint(v) ? { lat: +v.lat, lng: +v.lng } : start;
    pinRef.current.setPosition(p ?? null);
    pinRef.current.setVisible(Boolean(p));
    pinRef.current.setDraggable(!disabledRef.current);
    oldRef.current.setPosition(start ?? null);
    oldRef.current.setVisible(Boolean(start && mapIsPoint(v) && mapMeters(start, v) > 5));
    if (p) {
      if ((map.getZoom() || 0) < 15) map.setZoom(17);
      map.panTo(p);
    }
  };
  useEffect(sync, [cur?.lat, cur?.lng, start?.lat, start?.lng, disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Google place search, 650 ms after typing stops, near the point */
  useEffect(() => {
    const t = term.trim();
    if (t.length < 3 || typeof api?.searchPlaces !== 'function') {
      setPlaces([]);
      setSearching(false);
      setFindErr(null);
      return undefined;
    }
    let gone = false;
    const timer = setTimeout(() => {
      setSearching(true);
      setFindErr(null);
      api
        .searchPlaces({ q: t, ...(pt ? { lat: pt.lat, lng: pt.lng } : {}) })
        .then((m) => {
          if (gone) return;
          const list = (m?.places ?? []).filter((p) => p.lat != null && p.lng != null);
          setPlaces(list);
          if (!list.length) setFindErr(`No places found for “${t}”. Try the clinic name with the area.`);
        })
        .catch((e) => !gone && setFindErr(e?.message || 'The search failed. Please try again.'))
        .finally(() => !gone && setSearching(false));
    }, 650);
    return () => {
      gone = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const myLocation = () => {
    if (!navigator.geolocation) return setFindErr('This phone can’t share its location.');
    setLocating(true);
    setFindErr(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        set({ lat: p.coords.latitude, lng: p.coords.longitude, how: 'gps', acc: Math.round(p.coords.accuracy || 0) || undefined });
      },
      (e) => {
        setLocating(false);
        setFindErr(e?.code === 1 ? 'Location is blocked for this app. Allow it in the phone settings, or search the place.' : 'Couldn’t get your location. Try again, or search the place.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const moved = cur ? mapMoved(cur) : '';
  return (
    <div className="flex flex-col gap-2.5">
      {disabled ? null : (
        <>
          <div className="flex gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search on Google Maps</span>
              <Icon name="search" size="sm" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ds-muted" />
              <input
                type="search"
                value={term}
                autoComplete="off"
                placeholder="Search the clinic on Google Maps"
                onChange={(e) => setTerm(e.target.value)}
                className="h-10 w-full rounded-lg bg-surface pl-9 pr-3 text-13 text-body shadow-field placeholder:text-placeholder focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={myLocation}
              disabled={locating}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-12 font-semibold text-heading hover:border-line-strong disabled:opacity-60"
            >
              <Icon name={locating ? 'spinner pi-spin' : 'compass'} size="sm" />
              My location
            </button>
          </div>
          {searching ? (
            <p className="flex items-center gap-2 text-11 text-ds-muted">
              <Icon name="spinner pi-spin" size="sm" />
              Searching…
            </p>
          ) : null}
          {findErr ? (
            <p role="status" className="flex items-center gap-1.5 text-11 font-medium text-danger-text">
              <Icon name="exclamation-circle" size="sm" />
              {findErr}
            </p>
          ) : null}
          {places.length ? (
            <div role="list" className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
              {places.map((p, k) => (
                <button
                  key={p.id || k}
                  type="button"
                  role="listitem"
                  onClick={() => {
                    setPlaces([]);
                    setTerm('');
                    set({ lat: p.lat, lng: p.lng, how: 'place', place_id: p.id, name: p.title, address: p.address, url: p.url });
                  }}
                  className={cx('flex min-h-11 items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-brand-tint-weak', k && 'border-t border-line')}
                >
                  <Icon name="map-marker" size="sm" className="mt-0.5 shrink-0 text-danger-text" />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-12 font-semibold text-heading">{p.title || 'Place'}</span>
                    <span className="text-11 text-ds-muted [overflow-wrap:anywhere]">{p.address}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}

      <div className="relative h-64 overflow-hidden rounded-lg border border-line bg-sunken">
        <div ref={boxRef} className="size-full" aria-label="Map" />
        {mapErr ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 p-4 text-center text-12 text-ds-muted">
            <Icon name="map" size="lg" className="shrink-0" />
            <span>{mapErr} You can still search the place or use your location.</span>
          </div>
        ) : null}
      </div>

      {cur ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-success bg-success-wash px-3 py-2.5">
          <Icon name="check-circle" size="sm" className="mt-0.5 shrink-0 text-success" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-12 font-semibold text-heading [overflow-wrap:anywhere]">{mapText(cur)}</span>
            <span className="text-11 text-ds-muted [overflow-wrap:anywhere]">
              {(+cur.lat).toFixed(5)}, {(+cur.lng).toFixed(5)}
              {cur.acc ? ` · ±${cur.acc} m` : ''}
              {moved ? ` · ${moved}` : ''}
            </span>
            <a href={mapUrl(cur)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-11 font-semibold text-brand-text">
              <Icon name="external-link" size="var(--fs-10)" />
              Open in Google Maps
            </a>
          </div>
          {disabled ? null : (
            <button type="button" aria-label="Clear the answer" onClick={() => onChange(null)} className="flex size-7 shrink-0 items-center justify-center rounded-md text-ds-muted hover:bg-sunken">
              <Icon name="times" size="sm" />
            </button>
          )}
        </div>
      ) : start ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5">
          <Icon name="map-marker" size="sm" className="shrink-0 text-danger-text" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-12 font-semibold text-heading">Location on record</span>
            <a href={mapUrl(start)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-11 text-brand-text">
              {start.lat.toFixed(5)}, {start.lng.toFixed(5)}
              <Icon name="external-link" size="var(--fs-10)" />
            </a>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => set({ lat: start.lat, lng: start.lng, how: 'same' })}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-brand px-3 text-12 font-semibold text-brand-text disabled:opacity-50"
          >
            <Icon name="check" size="sm" />
            This is correct
          </button>
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-11 text-ds-muted">
          <Icon name="info-circle" size="sm" />
          No location on record yet — search the place above, use your location, or tap the map.
        </p>
      )}

      {disabled ? null : (
        <p className="flex items-center gap-1.5 text-11 text-ds-muted">
          <Icon name="arrows-alt" size="var(--fs-10)" />
          Drag the pin or tap the map to set the exact spot.
        </p>
      )}
    </div>
  );
}
