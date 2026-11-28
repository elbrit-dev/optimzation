'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, cx } from '@/design-system';
import { mapDist, mapIsPoint, mapMeters, mapStart, mapUrl } from '../data/shape';

/* 25 Nov 2026 · the Map location question — choose the doctor's HOSPITAL or
 * CLINIC from Google Maps (SURVEYS_CONTEXT.md §3), the same as the ERP's
 * My Surveys page (survey-center-update/src/page/ms-map.js).
 *
 * Only a Google hospital / clinic can be the answer — no free pins (the
 * server refuses an answer without a Google place id).
 *   • With a saved location (q.lat / q.lng / q.latlng from the record): the
 *     map is fixed on it (zoom in / out only) and every hospital and clinic
 *     within 400 m is a red dot with its name.
 *   • Without one: the map opens on India; "Near me", a search, or moving the
 *     map + "Search this area" finds them.
 * A tap on a name chooses that name's place; on one dot, that place; where
 * several dots sit under the finger it asks "Which one did you tap?" — never
 * a guess. Typing lists the matches at once (word starts: "laksh" → Lakshmi…),
 * then Google's search adds more.
 *
 * The answer: { lat, lng, how: 'place', place_id, name, address, url, kind,
 * was?: the saved point, was_place?: the Google place at the saved point }.
 * It is approved like every other answer, by the campaign's approval (survey_approval).
 *
 * 27 Nov 2026 · MORE THAN ONE PLACE (q.multi): one map, as a one-place question. The first tap chooses a place; then a
 * small "+ Add another …" button under the map lets the rep add one more, as many times as needed. Every chosen place
 * shows above the map with its ✕. The answer is the list of those points, the first one first.
 * The map with a saved point starts zoomed out enough to show the whole 400 m circle. */

let mapsPromise = null;
export function loadMaps(api) {
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
const ZONE = 400; /* the doctor's area (m) around the saved point */
const SAME = 50; /* a place this close to the saved point is the same location */
const KIND_ICON = { Hospital: 'building', Clinic: 'heart', 'Dental clinic': 'face-smile', Physiotherapy: 'user', Pharmacy: 'shopping-bag' };
const LABEL_CSS =
  '.sv-mq-lbl{padding:0 2px;text-shadow:0 0 2px #FFF,0 0 2px #FFF,0 0 3px #FFF,0 0 4px #FFF;white-space:nowrap}' +
  '.sv-mq-lbl.sv-mq-on{padding:1px 6px;border-radius:6px;background:#E6F4EA;text-shadow:none;box-shadow:0 1px 3px rgba(15,23,42,.25)}';

const norm = (x) => ` ${String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
const shortName = (t, n) => ((t || '').length > n ? `${t.slice(0, n - 1)}…` : t || '');
/* the zoom that shows `far` metres from the middle in half the map */
const fitZoom = (pt, far, el) => {
  const half = Math.max(120, Math.min(el?.clientWidth || 300, el?.clientHeight || 300) / 2 - 30);
  return Math.max(15, Math.min(18, Math.floor(Math.log2((156543.03 * Math.cos((pt.lat * Math.PI) / 180) * half) / Math.max(far, 1)))));
};

export function MapLocation({ q, value, onChange, disabled, api, response, searchSlot = null }) {
  const start = mapStart(q);
  const startKey = start ? `${start.lat},${start.lng}` : '';
  /* 27 Nov 2026 · more than one place: a list of chosen places, added one at a time ("+ Add another") */
  const multi = Boolean(q.multi);
  const [adding, setAdding] = useState(false);
  const picks = multi ? (Array.isArray(value) ? value : mapIsPoint(value) ? [value] : []).filter((p) => mapIsPoint(p) && p.place_id) : [];
  const cur = !multi && mapIsPoint(value) && value.place_id ? value : null;
  const chosen = multi ? picks : cur ? [cur] : [];
  const isOn = (id) => chosen.some((p) => p.place_id === id);

  /* every hospital / clinic around a point */
  const [near, setNear] = useState({ center: null, label: '', places: [], busy: '', full: false, err: '' });
  /* typed search */
  const [term, setTerm] = useState('');
  const [res, setRes] = useState([]);
  const [searching, setSearching] = useState(false);
  const [findErr, setFindErr] = useState('');
  const [hint, setHint] = useState('');
  const [moved, setMoved] = useState(false);
  /* 25 Nov 2026 · no saved location: where the map starts — the record's locality, else its city (survey_places mode=area) */
  const [area, setArea] = useState(null);
  const [mapErr, setMapErr] = useState(null);

  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const dotsRef = useRef({});
  const pickRef = useRef(null);
  const zoneRef = useRef(null);
  const lockRef = useRef(null); /* the fixed centre while the map is locked on the saved point */
  const quietRef = useRef(0); /* map taps are ignored until this time (just after the matches list closes) */
  const genRef = useRef(0);
  const fitRef = useRef(false);
  const hintTimer = useRef(0);

  /* the latest values for the map's own listeners */
  const live = useRef({});
  /* 25 Nov 2026 · the question's places: hospitals & clinics (default) or pharmacies (q.places = 'pharmacy') */
  const ph = q.places === 'pharmacy';
  const n1 = ph ? 'pharmacies' : 'hospitals and clinics';
  const n0 = ph ? 'pharmacy' : 'hospital or clinic';
  /* a tap chooses a place: always on a one-place question; with more than one place, while none is chosen or after "+ Add another" */
  const picking = !multi || !picks.length || adding;
  live.current = { start, cur, chosen, multi, picking, near, res, term, disabled, onChange, ph, n0, n1 };

  const all = useCallback(() => {
    const seen = {};
    return [...live.current.res, ...live.current.near.places].filter((p) => (seen[p.id] ? false : (seen[p.id] = 1)));
  }, []);

  const flash = (t) => {
    setHint(t);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(''), 3500);
  };

  /* choosing = the Google place itself; nothing else can be the answer */
  const choose = useCallback(
    (id) => {
      const L = live.current;
      if (L.disabled) return;
      const p = all().find((x) => x.id === id);
      if (!p) return;
      const v = { lat: +(+p.lat).toFixed(7), lng: +(+p.lng).toFixed(7), how: 'place', place_id: p.id, name: p.title || '', address: p.address || '', url: p.url || '', kind: p.kind || '' };
      if (L.start) {
        v.was = L.start;
        const at = all()
          .map((x) => ({ x, d: mapMeters(L.start, x) }))
          .filter((o) => o.d <= SAME)
          .sort((a, b) => a.d - b.d)[0];
        if (at) v.was_place = { id: at.x.id, name: at.x.title || '', url: at.x.url || '', dist: Math.round(at.d) };
      }
      if (L.multi) {
        /* more than one place: a tap adds one while choosing; a chosen one is taken off with its ✕ */
        if (L.chosen.some((x) => x.place_id === v.place_id)) {
          flash('Already chosen.');
          return;
        }
        if (!L.picking) {
          flash(`Tap “Add another ${L.n0}” under the map to add one more.`);
          return;
        }
        L.onChange([...L.chosen, v]);
        setAdding(false);
        return;
      }
      L.onChange(v);
    },
    [all],
  );

  /* the hospitals / clinics around a point (`more`: the wider sweep after the first answer) */
  const loadNear = useCallback(
    (c, label, more) => {
      if (typeof api?.places !== 'function') return;
      const gen = genRef.current;
      const center = more ? live.current.near.center : { lat: +c.lat, lng: +c.lng };
      setNear((n) => (more ? { ...n, busy: 'more', err: '' } : { center, label: label || 'here', places: [], busy: 'first', full: false, err: '' }));
      if (!more) setMoved(false);
      api
        .places({ mode: 'nearby', lat: center.lat, lng: center.lng, radius_m: ZONE, split: more ? 3 : 0, kind: live.current.ph ? 'pharmacy' : undefined })
        .then((m) => {
          if (gen !== genRef.current) return;
          const got = (m?.places ?? []).filter((p) => p.lat != null && p.lng != null);
          setNear((n) => {
            const seen = {};
            const places = [...(more ? n.places : []), ...got]
              .filter((p) => (seen[p.id] ? false : (seen[p.id] = 1)))
              .sort((x, y) => mapMeters(center, x) - mapMeters(center, y));
            const st = live.current.start;
            if (!more) fitRef.current = places.length > 0 && mapMeters(center, places[0]) > 90;
            const err = !places.length && (more || !st) ? `Google Maps has no ${live.current.n0} within ${mapDist(ZONE)} of this point. Search it by name.` : '';
            return { ...n, center, places, busy: '', full: Boolean(more) || n.full, err };
          });
          if (!more && live.current.start) loadNear(null, null, true);
        })
        .catch((e) => gen === genRef.current && setNear((n) => ({ ...n, busy: '', err: e?.message || `Couldn’t load the ${live.current.n1}. Please try again.` })));
    },
    [api],
  );

  /* a new record: start over at its saved point */
  useEffect(() => {
    genRef.current += 1;
    setTerm('');
    setRes([]);
    setNear({ center: null, label: '', places: [], busy: '', full: false, err: '' });
    setArea(null);
    if (start) loadNear(start, 'the doctor’s saved location');
    else if (response && typeof api?.places === 'function') {
      const gen = genRef.current;
      api
        .places({ mode: 'area', response })
        .then((m) => {
          const a = m?.area;
          if (gen !== genRef.current || !a?.lat) return;
          setArea(a);
          loadNear({ lat: +a.lat, lng: +a.lng }, `${a.label} (${a.level})`);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id, startKey]);

  /* the places on the map whose name has every word typed, nearest first */
  const local = useCallback((t) => {
    const L = live.current;
    const whole = norm(t).trim();
    const words = whole.split(' ').filter(Boolean);
    const c = L.start || L.near.center;
    if (!words.length) return [];
    return L.near.places
      .filter((p) => {
        const n = norm(p.title);
        return words.every((w) => n.includes(` ${w}`)) || n.includes(whole);
      })
      .sort((a, b) => (c ? mapMeters(c, a) - mapMeters(c, b) : 0));
  }, []);

  /* typing: what is on the map at once (2+ letters), Google's search after a short pause (3+) */
  useEffect(() => {
    const t = term.trim();
    const loc = t.length >= 2 ? local(t) : [];
    setRes(loc);
    setFindErr('');
    setSearching(false);
    if (t.length < 3 || typeof api?.places !== 'function') return undefined;
    let gone = false;
    const timer = setTimeout(() => {
      const L = live.current;
      const mc = mapRef.current?.getCenter();
      const c = (mc ? { lat: mc.lat(), lng: mc.lng() } : null) || L.start || L.near.center;
      setSearching(true);
      api
        .places({ mode: 'text', q: t, kind: live.current.ph ? 'pharmacy' : undefined, ...(c ? { lat: c.lat, lng: c.lng } : {}) })
        .then((m) => {
          if (gone) return;
          const ids = {};
          loc.forEach((p) => (ids[p.id] = 1));
          const g = (m?.places ?? []).filter((p) => p.lat != null && p.lng != null && !ids[p.id]);
          const both = [...loc, ...g];
          const list = both.sort((a, b) => (c ? mapMeters(c, a) - mapMeters(c, b) : 0));
          setRes(list);
          if (!list.length) setFindErr(`No ${live.current.n0} called “${t}”. Try another name.`);
        })
        .catch((e) => !gone && !loc.length && setFindErr(e?.message || 'The search failed. Please try again.'))
        .finally(() => !gone && setSearching(false));
    }, 450);
    return () => {
      gone = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  /* names next to the dots, nearest to the middle first; a name that would sit on another is left out (zoom in) */
  const labels = useCallback(() => {
    const map = mapRef.current;
    const gm = window.google?.maps;
    if (!map || !gm) return;
    const proj = map.getProjection();
    const b = map.getBounds();
    const z = map.getZoom() || 0;
    if (!proj || !b) return;
    const sc = 2 ** z;
    const nw = proj.fromLatLngToPoint(new gm.LatLng(b.getNorthEast().lat(), b.getSouthWest().lng()));
    const c = map.getCenter();
    const mid = { lat: c.lat(), lng: c.lng() };
    const dots = dotsRef.current;
    const pos = (id) => ({ lat: dots[id].getPosition().lat(), lng: dots[id].getPosition().lng() });
    const ids = Object.keys(dots)
      .filter((id) => dots[id].getVisible() && b.contains(dots[id].getPosition()))
      .sort((x, y) => mapMeters(mid, pos(x)) - mapMeters(mid, pos(y)));
    Object.keys(dots).forEach((id) => !ids.includes(id) && dots[id].setLabel(null));
    const taken = [];
    live.current.chosen.forEach((v) => {
      const pt = proj.fromLatLngToPoint(new gm.LatLng(+v.lat, +v.lng));
      const x = (pt.x - nw.x) * sc;
      const y = (pt.y - nw.y) * sc;
      const w = Math.min((v.name || '').length + 2, 32) * 6.8 + 10;
      taken.push({ l: x - 14, r: x + 14, t: y - 44, b: y + 2, cx: x, cy: y, dot: 1 }, { l: x - w / 2, r: x + w / 2, t: y + 2, b: y + 20 });
    });
    ids.forEach((id) => {
      const m = dots[id];
      const pt = proj.fromLatLngToPoint(m.getPosition());
      const x = (pt.x - nw.x) * sc;
      const y = (pt.y - nw.y) * sc;
      const w = Math.min(m.svName.length, 26) * 6.4 + 8;
      const box = { l: x - w / 2, r: x + w / 2, t: y + 8, b: y + 24 };
      const hit =
        z < 14 ||
        !m.svName ||
        taken.some((o) => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t) ||
        taken.some((o) => o.dot && Math.abs(o.cx - x) < 9 && Math.abs(o.cy - y) < 9);
      taken.push({ l: x - 7, r: x + 7, t: y - 7, b: y + 7, cx: x, cy: y, dot: 1 });
      if (hit) return m.setLabel(null);
      m.setLabel({ text: m.svName, className: 'sv-mq-lbl', color: '#B3261E', fontSize: '11px', fontWeight: '700' });
      taken.push(box);
    });
  }, []);

  /* a Google icon tapped: look it up; only a hospital / clinic is accepted */
  const tapPlace = useCallback(
    (pid) => {
      if (all().some((x) => x.id === pid)) return choose(pid);
      if (typeof api?.places !== 'function') return undefined;
      flash('Checking the place…');
      return api
        .places({ mode: 'details', id: pid, kind: live.current.ph ? 'pharmacy' : undefined })
        .then((m) => {
          const p = (m?.places ?? [])[0];
          if (!p) return flash(`That isn’t a ${live.current.n0} — choose a ${live.current.n0}.`);
          live.current.near = { ...live.current.near, places: [p, ...live.current.near.places.filter((x) => x.id !== p.id)] };
          setNear((n) => ({ ...n, places: [p, ...n.places.filter((x) => x.id !== p.id)] }));
          choose(p.id);
          return undefined;
        })
        .catch((e) => flash(e?.message || 'Couldn’t check that place.'));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, all, choose],
  );

  /* a tap on the map: on a name → that name's place; on one dot → that place; several close together → the nearest
     one is chosen and, when they crowd together, the map zooms in a little so another can be tapped exactly
     (27 Nov 2026: no "Which one?" list — it covered the map); nothing → a hint */
  const tap = useCallback(
    (e) => {
      const map = mapRef.current;
      const gm = window.google?.maps;
      if (live.current.disabled || !map || !gm || !e?.latLng) return;
      /* 27 Nov 2026 · the tap that cleared the search (or chose a match) falls through to the map as the list
         closes and the box shrinks: it must not choose a place */
      if (Date.now() < quietRef.current) return;
      const proj = map.getProjection();
      const b = map.getBounds();
      if (!proj || !b) return;
      const sc = 2 ** (map.getZoom() || 0);
      const nw = proj.fromLatLngToPoint(new gm.LatLng(b.getNorthEast().lat(), b.getSouthWest().lng()));
      const px = (ll) => {
        const pt = proj.fromLatLngToPoint(ll);
        return { x: (pt.x - nw.x) * sc, y: (pt.y - nw.y) * sc };
      };
      const t = px(e.latLng);
      const dots = dotsRef.current;
      const dist = (id) => {
        const d = px(dots[id].getPosition());
        return Math.hypot(d.x - t.x, d.y - t.y);
      };
      const close = Object.keys(dots)
        .filter((id) => dots[id].getVisible())
        .map((id) => ({ id, d: dist(id) }))
        .filter((o) => o.d <= 16)
        .sort((a, c) => a.d - c.d);
      /* the names as drawn on screen: which one is under the finger, then the dot that has that name */
      let onName = [];
      const de = e.domEvent || {};
      const touch = de.changedTouches?.[0];
      const cxp = de.clientX ?? touch?.clientX;
      const cyp = de.clientY ?? touch?.clientY;
      if (cxp != null && boxRef.current) {
        boxRef.current.querySelectorAll('.sv-mq-lbl').forEach((lb) => {
          const rc = lb.getBoundingClientRect();
          if (!rc.width || cxp < rc.left - 3 || cxp > rc.right + 3 || cyp < rc.top - 3 || cyp > rc.bottom + 3) return;
          if (lb.classList.contains('sv-mq-on')) return onName.push('__picked__');
          const txt = lb.textContent.trim();
          const own = Object.keys(dots)
            .filter((id) => dots[id].getLabel()?.text === txt)
            .map((id) => ({ id, d: dist(id) }))
            .sort((a, c) => a.d - c.d)[0];
          if (own && !onName.includes(own.id)) onName.push(own.id);
          return undefined;
        });
      }
      if (onName.includes('__picked__')) {
        if (onName.length === 1 && !close.length) return;
        onName = onName.filter((x) => x !== '__picked__');
      }
      const ids = [...onName];
      close.forEach((o) => !ids.includes(o.id) && ids.push(o.id));
      if (onName.length === 1 && !close.some((o) => o.d <= 7 && o.id !== onName[0])) return choose(onName[0]);
      if (!onName.length && close.length === 1) return choose(close[0].id);
      if (ids.length > 1) {
        const pick = onName[0] || close[0].id;
        /* crowded: 3 or more under the finger, or 2 almost on top of each other (under 12 px apart) */
        const a = px(dots[ids[0]].getPosition());
        const c = px(dots[ids[1]].getPosition());
        const crowded = ids.length >= 3 || Math.hypot(a.x - c.x, a.y - c.y) < 12;
        choose(pick);
        if (crowded && (map.getZoom() || 0) < 20) {
          map.setZoom(Math.min((map.getZoom() || 0) + 2, 20));
          map.panTo(dots[pick].getPosition());
        }
        return undefined;
      }
      if (e.placeId) return tapPlace(e.placeId);
      flash(`Tap a red dot or its name to choose that ${live.current.n0}.`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [choose, tapPlace],
  );
  const tapRef = useRef(tap);
  tapRef.current = tap;

  /* the map, once */
  useEffect(() => {
    let gone = false;
    if (!document.getElementById('sv-mq-css')) {
      const st = document.createElement('style');
      st.id = 'sv-mq-css';
      st.textContent = LABEL_CSS;
      document.head.appendChild(st);
    }
    loadMaps(api)
      .then((gm) => {
        if (gone || !boxRef.current || mapRef.current) return;
        const s0 = live.current.start;
        const map = new gm.Map(boxRef.current, {
          center: s0 ?? INDIA,
          zoom: s0 ? fitZoom(s0, ZONE * 1.15, boxRef.current) : 5,
          draggableCursor: 'pointer',
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
          gestureHandling: 'cooperative',
          maxZoom: 20,
          styles: [
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', stylers: [{ visibility: 'off' }] },
            { featureType: 'landscape.man_made', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          ],
        });
        map.addListener('idle', () => labels());
        /* a fixed map: whatever zooms it, the saved location stays in the middle */
        const keep = () => {
          const f = lockRef.current;
          const c = map.getCenter();
          if (f && c && (Math.abs(c.lat() - f.lat) > 1e-7 || Math.abs(c.lng() - f.lng) > 1e-7)) map.setCenter(f);
        };
        map.addListener('zoom_changed', keep);
        map.addListener('center_changed', keep);
        map.addListener('click', (e) => {
          e?.stop?.();
          tapRef.current(e);
        });
        map.addListener('dragend', () => !lockRef.current && setMoved(true));
        pickRef.current = {};
        mapRef.current = map;
        setMapErr(null);
        setNear((n) => ({ ...n })); /* draw what is already loaded */
      })
      .catch((e) => !gone && setMapErr(e?.message || 'The map could not load.'));
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* the zone and the lock follow the saved point */
  useEffect(() => {
    const map = mapRef.current;
    const gm = window.google?.maps;
    if (!map || !gm) return;
    zoneRef.current?.setMap(null);
    zoneRef.current = null;
    if (start) {
      zoneRef.current = new gm.Circle({ map, center: start, radius: ZONE, clickable: false, strokeColor: '#0958D9', strokeOpacity: 0.55, strokeWeight: 1.5, fillColor: '#0958D9', fillOpacity: 0.04 });
      lockRef.current = null;
      map.setOptions({ draggable: true, keyboardShortcuts: true, minZoom: null });
      map.setCenter(start);
      map.setZoom(fitZoom(start, ZONE * 1.15, boxRef.current)); /* 26 Nov 2026: the whole circle in view */
    } else {
      lockRef.current = null;
      map.setOptions({ draggable: true, keyboardShortcuts: true, minZoom: null });
      if (!chosen.length) {
        map.setCenter(INDIA);
        map.setZoom(5);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKey, q.id, Boolean(mapRef.current)]);

  /* the dots and the chosen pin follow the lists and the answer */
  const showRes = term.trim().length >= 3 && res.length;
  useEffect(() => {
    const map = mapRef.current;
    const gm = window.google?.maps;
    if (!map || !gm) return;
    const pins = pickRef.current || {};
    const keepPin = {};
    chosen.forEach((c) => {
      keepPin[c.place_id] = 1;
      if (!pins[c.place_id]) pins[c.place_id] = new gm.Marker({ map, zIndex: 20, clickable: false, title: 'Chosen' });
      const pin = pins[c.place_id];
      pin.setPosition({ lat: +c.lat, lng: +c.lng });
      pin.setIcon({ url: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png', scaledSize: new gm.Size(44, 44), labelOrigin: new gm.Point(22, 54) });
      pin.setLabel({ text: `✓ ${shortName(c.name || 'Chosen', 30)}`, className: 'sv-mq-lbl sv-mq-on', color: '#137333', fontSize: '12px', fontWeight: '700' });
    });
    Object.keys(pins).forEach((id) => {
      if (!keepPin[id]) {
        pins[id].setMap(null);
        delete pins[id];
      }
    });
    pickRef.current = pins;
    const dots = dotsRef.current;
    const want = {};
    (showRes ? res : near.places).forEach((p) => (want[p.id] = p));
    Object.keys(dots).forEach((id) => {
      if (!want[id]) {
        dots[id].setMap(null);
        delete dots[id];
      }
    });
    Object.values(want).forEach((p) => {
      if (!dots[p.id]) {
        dots[p.id] = new gm.Marker({
          map,
          position: { lat: +p.lat, lng: +p.lng },
          zIndex: 3,
          clickable: false,
          title: `${p.title || ''}${p.kind ? ` · ${p.kind}` : ''}`,
          icon: { path: gm.SymbolPath.CIRCLE, scale: 7, fillColor: '#D93025', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 2, labelOrigin: new gm.Point(0, 2.9) },
        });
        dots[p.id].svName = shortName(p.title, 26);
      }
      dots[p.id].setVisible(!isOn(p.id));
    });
    /* nothing close to the saved location: zoom out to the nearest few */
    if (fitRef.current && start && near.places.length) {
      fitRef.current = false;
      map.setZoom(fitZoom(start, Math.max(...near.places.slice(0, 4).map((p) => mapMeters(start, p))), boxRef.current));
    }
    labels();
  }, [chosen.map((c) => c.place_id).join('|'), near.places, res, showRes, mapErr, labels]); // eslint-disable-line react-hooks/exhaustive-deps

  /* without a saved point the map goes where the answer / results / searched point are */
  useEffect(() => {
    const map = mapRef.current;
    const gm = window.google?.maps;
    if (!map || !gm || lockRef.current) return;
    if (showRes) {
      const bd = new gm.LatLngBounds();
      res.forEach((p) => bd.extend({ lat: +p.lat, lng: +p.lng }));
      map.fitBounds(bd, 40);
    } else if (near.center) {
      map.panTo(near.center);
      if ((map.getZoom() || 0) < 15) map.setZoom(16);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRes, res.length, near.center?.lat, near.center?.lng]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || lockRef.current || !cur) return;
    map.panTo({ lat: +cur.lat, lng: +cur.lng });
    if ((map.getZoom() || 0) < 16) map.setZoom(17);
  }, [cur?.place_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const nearMe = () => {
    if (!navigator.geolocation) return setFindErr('This phone can’t share its location.');
    flash(`Finding ${n1} near you…`);
    return navigator.geolocation.getCurrentPosition(
      (p) => {
        setTerm('');
        loadNear({ lat: p.coords.latitude, lng: p.coords.longitude }, 'you');
      },
      (e) =>
        setFindErr(e?.code === 1 ? 'Location is blocked for this app. Allow it in the phone settings, or search by name.' : 'Couldn’t get your location. Try again, or search by name.'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };
  const searchHere = () => {
    const c = mapRef.current?.getCenter();
    if (!c) return;
    setTerm('');
    loadNear({ lat: c.lat(), lng: c.lng() }, 'this area');
  };

  /* one row: a hospital / clinic to choose */
  const ref = start || near.center;
  const row = (p, fromWhich) => {
    const on = isOn(p.id);
    const d = ref ? mapMeters(ref, p) : null;
    return (
      <li key={p.id} role="option" aria-selected={on}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            choose(p.id);
            if (!fromWhich) setTerm('');
          }}
          className={cx('flex min-h-[52px] w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-brand-tint-weak', on && 'bg-success-wash')}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-tint-weak text-brand-text">
            <Icon name={KIND_ICON[p.kind] || 'plus'} size="sm" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-13 font-semibold text-heading [overflow-wrap:anywhere]">{p.title}</span>
            <span className="truncate text-12 text-ds-muted">
              {[p.kind, d != null ? `${mapDist(d)}${start ? ' from the saved location' : ' away'}` : '', p.address].filter(Boolean).join(' · ')}
            </span>
          </span>
          <Icon name={on ? 'check-circle' : multi && picks.length && adding ? 'plus-circle' : 'angle-right'} size="sm" className={cx('shrink-0', on ? 'text-success' : 'text-ds-muted')} />
        </button>
      </li>
    );
  };

  const typed = term.trim();
  const recs = typed.length >= 2 ? res : near.places;
  const recHead =
    typed.length >= 2
      ? res.length
        ? `${res.length} found for “${typed}”`
        : searching
          ? 'Searching…'
          : 'No match on the map yet'
      : recs.length
        ? `Nearby · ${recs.length} ${n1} ${start ? `around the saved location${near.full ? '' : ' so far'}` : `around ${near.label || 'here'}`}`
        : near.busy
          ? `Finding ${n1} nearby…`
          : start
            ? `No ${n0} found nearby`
            : `Tap Near me or search to see ${n1}`;
  const err = findErr || near.err;

  /* 27 Nov 2026 · compact, map first (one screen on a phone): the chosen place as one line, the map with the search
     on top of it (matches open over the map), and the nearby places as one row of buttons under it */
  const placeLine = (v, onRemove) => {
    const d = start ? mapMeters(start, v) : null;
    return (
      <div key={v.place_id || 'cur'} className="flex items-center gap-2 rounded-lg border border-success bg-success-wash px-3 py-2">
        <Icon name="check-circle" size="sm" className="shrink-0 text-success" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-13 font-semibold text-heading [overflow-wrap:anywhere]">{v.name || 'Place'}</span>
          <span className="truncate text-12 text-ds-muted">
            {[v.kind, d != null ? (d <= SAME && !ph ? 'At the saved location' : `${mapDist(d)} from the saved location`) : '', v.address].filter(Boolean).join(' · ')}
          </span>
        </span>
        <a href={mapUrl(v)} target="_blank" rel="noopener noreferrer" aria-label="Open in Google Maps" className="flex size-9 shrink-0 items-center justify-center rounded-md text-brand-text hover:bg-surface">
          <Icon name="external-link" size="sm" />
        </a>
        {disabled ? null : (
          <button type="button" aria-label={`Take off ${v.name || 'this place'}`} onClick={onRemove} className="-mr-1.5 flex size-10 shrink-0 items-center justify-center rounded-md text-ds-muted hover:bg-surface">
            <Icon name="times" size="sm" />
          </button>
        )}
      </div>
    );
  };
  const showMatches = !disabled && typed.length >= 2;
  /* 27 Nov 2026 · when the matches open, the search goes to the top of the screen so the list fits above the
     Save / Submit bar */
  const shownRef = useRef(false);
  const searchRef = useRef(null);
  useEffect(() => {
    if (showMatches) searchRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    else if (shownRef.current) quietRef.current = Date.now() + 600;
    shownRef.current = showMatches;
  }, [showMatches]);
  const chips = !disabled && !showMatches ? near.places.slice(0, 15) : [];
  /* 28 Nov 2026 · the small search bar: above the map, or — inside a Repeated group — in the entry's title row
     ("Entry 1 ········ [search]"), where the reps asked for it; Near me becomes an icon there */
  const searchBar = (inHeader) => (
    <div ref={searchRef} className={cx('flex scroll-mt-2 gap-2', inHeader ? 'w-full' : '')}>
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Search {n1}</span>
        <Icon name="search" size="sm" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ds-muted" />
        <input
          type="search"
          value={term}
          autoComplete="off"
          placeholder={inHeader ? `Search a ${n0}` : start ? `Can’t see it? Search a ${n0}` : `Search a ${n0}`}
          onChange={(e) => setTerm(e.target.value)}
          className={cx('w-full rounded-lg border border-line-strong bg-surface pl-8 pr-2 text-body placeholder:text-placeholder focus:border-brand focus:outline-none', inHeader ? 'h-8 text-12' : 'h-9 text-13')}
        />
      </label>
      {start ? null : (
        <button type="button" onClick={nearMe} aria-label={inHeader ? 'Near me' : undefined} className={cx('flex shrink-0 items-center gap-1.5 rounded-lg border border-line-strong bg-surface font-semibold text-heading', inHeader ? 'h-8 px-2 text-11' : 'h-9 px-3 text-12')}>
          <Icon name="compass" size="sm" />
          {inHeader ? null : 'Near me'}
        </button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {multi && picks.length ? (
        <div className="flex flex-col gap-1.5" aria-label={`Chosen ${n1}`}>
          {picks.map((v) => placeLine(v, () => onChange(picks.length > 1 ? picks.filter((x) => x.place_id !== v.place_id) : null)))}
          {adding && !disabled ? (
            <div className="flex items-center gap-2 rounded-lg border border-brand bg-brand-tint-weak px-3 py-1.5">
              <Icon name="plus-circle" size="sm" className="shrink-0 text-brand-text" />
              <span className="min-w-0 flex-1 text-12 font-semibold text-heading">Tap one more {n0} on the map.</span>
              <button type="button" onClick={() => setAdding(false)} className="flex h-9 shrink-0 items-center rounded-md px-2 text-12 font-semibold text-brand-text hover:bg-surface">
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      ) : cur ? (
        placeLine(cur, () => onChange(null))
      ) : start ? null : (
        <p className="flex items-start gap-1.5 text-12 text-ds-muted">
          <Icon name={start ? 'map-marker' : 'info-circle'} size="sm" className={cx('mt-px shrink-0', start ? 'text-brand-text' : '')} />
          <span>
            {start
              ? `The map starts at the doctor’s saved location. Tap the ${n0} on the map or below.`
              : area
                ? `No saved location: the map starts at ${area.label}. Search, or tap Near me.`
                : `No saved location. Search the ${n0} by name, or tap Near me.`}
          </span>
        </p>
      )}

      {/* 28 Nov 2026 · a small search bar ABOVE the map on every map (also when the doctor has a saved location — reps
         asked for it), matches listed under it; nothing covers the map any more */}
      {disabled ? null : searchSlot ? createPortal(searchBar(true), searchSlot) : searchBar(false)}
      {showMatches ? (
        <div role="region" aria-label={`Matching ${n1}`} className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
          <p className="shrink-0 border-b border-line px-3 py-1.5 text-12 font-semibold text-body">{recHead}</p>
          <ul role="listbox" className="flex max-h-[min(50dvh,360px)] min-h-0 flex-col overflow-y-auto p-1">
            {res.map((x) => row(x, false))}
            {searching ? (
              <li className="flex items-center gap-1.5 px-2.5 py-2 text-12 text-ds-muted">
                <Icon name="spinner pi-spin" size="sm" />
                Looking on Google Maps too…
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <div className="relative h-[300px] overflow-hidden rounded-lg border border-line bg-sunken max-sm:h-[230px]">
        <div ref={boxRef} className="absolute inset-0" role="region" aria-label={`Map of ${n1} — tap one to choose it`} />
        {mapErr ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 p-4 text-center text-12 text-ds-muted">
            <Icon name="map" size="lg" className="shrink-0" />
            <span>{mapErr} You can still search and choose from the list.</span>
          </div>
        ) : null}
        {moved && !disabled && !showMatches ? (
          <button
            type="button"
            onClick={searchHere}
            className="absolute bottom-2.5 left-1/2 flex h-10 -translate-x-1/2 items-center gap-1.5 rounded-full bg-surface px-4 text-12 font-semibold text-brand-text shadow-md"
          >
            <Icon name="refresh" size="sm" />
            Search this area
          </button>
        ) : null}
        {(near.busy || searching) && !showMatches ? (
          <div role="status" className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-12 text-heading shadow-md">
            <Icon name="spinner pi-spin" size="sm" />
            {near.busy === 'more' ? `Loading all ${n1}…` : `Finding ${n1}…`}
          </div>
        ) : null}
        {hint ? (
          <div role="status" className="absolute left-1/2 top-2 max-w-[90%] -translate-x-1/2 rounded-lg bg-heading px-3 py-2 text-center text-12 text-surface shadow-md">
            {hint}
          </div>
        ) : null}
      </div>

      {chips.length ? (
        <div className="flex flex-col gap-1">
          <span className="text-11 font-medium text-ds-muted">Nearby · {near.places.length}</span>
          <ul role="listbox" aria-label={`Nearby ${n1}`} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {chips.map((x) => {
              const on = isOn(x.id);
              const d = ref ? mapMeters(ref, x) : null;
              return (
                <li key={x.id} role="option" aria-selected={on} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => choose(x.id)}
                    className={cx('flex min-h-11 max-w-[220px] flex-col items-start justify-center rounded-lg border px-3 py-1 text-left', on ? 'border-success bg-success-wash' : 'border-line bg-surface hover:border-line-strong')}
                  >
                    <span className="w-full truncate text-12 font-semibold text-heading">{x.title}</span>
                    {d != null ? <span className="text-11 text-ds-muted">{mapDist(d)}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : !disabled && !showMatches && near.busy ? null : !disabled && !showMatches && start && !near.places.length ? (
        <span className="text-11 text-ds-muted">{recHead}</span>
      ) : null}


      {multi && picks.length && !adding && !disabled ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex h-10 items-center gap-1.5 self-start rounded-lg border border-dashed border-brand px-3 text-13 font-semibold text-brand-text hover:bg-brand-tint-weak"
        >
          <Icon name="plus" size="sm" />
          Add another {n0}
        </button>
      ) : null}
      {err ? (
        <p role="alert" className="flex items-center gap-1.5 text-12 font-medium text-danger-text">
          <Icon name="exclamation-circle" size="sm" />
          {err}
        </p>
      ) : null}
    </div>
  );
}
