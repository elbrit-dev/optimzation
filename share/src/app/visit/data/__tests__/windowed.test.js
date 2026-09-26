import { describe, expect, it, vi, afterEach } from 'vitest';

vi.mock('@/app/graphql-playground/constants', () => ({
  getEndpointConfigFromUrlKeyAsync: async () => ({ endpointUrl: 'https://erp.example.com/api/method/graphql' }),
}));

const { fetchVisitDataset, clearVisitCache } = await import('../liveSource');
const { planned, happened, visitsByHour } = await import('../selectors');

/* The visits are COUNTED on the server (elbrit_visit_summary) — a month is
   ~55,000 visits on production, far too many to download and count here —
   and the rows behind a list are fetched only when it opens
   (elbrit_visit_rows). These drive the real fetchVisitDataset through a
   stubbed ERP and check what it asks for and what it makes of the answers. */

const days = (from, to) => {
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
};

function stubErp({ perDay = 1, team = [] } = {}) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    const u = String(url);
    const body = init?.body ? JSON.parse(init.body) : {};
    if (u.endsWith('/api/method/elbrit_visit_summary')) {
      calls.push({ method: 'summary', ...body });
      const list = days(body.from, body.to);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            employees: ['E1'],
            days: list,
            hqs: ['HQ-Erode'],
            // per day: `perDay` done at 10:00, verified, solo
            rows: list.map((_, d) => [0, d, 0, 1, 0, 10, perDay]),
            visits: list.length * perDay,
          },
        }),
      };
    }
    if (u.endsWith('/api/method/elbrit_visit_rows')) {
      calls.push({ method: 'rows', ...body });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            rows: [{
              eventId: 'EV1', plannedDate: body.from, planOwnerId: 'E1', doctorId: 'L1', doctorName: 'Dr A',
              doctorCity: '', doctorSpecialty: '', doctorCategories: [], hq: 'HQ-Erode', department: '', pobGiven: false,
              visitTime: `${body.from} 10:05:00`, distanceKm: null, forceVisit: false, forceVisitReason: '',
              participantRef: 'E1', participantRefType: 'Employee', participantCount: 1,
            }],
          },
        }),
      };
    }
    if (u.includes('get_logged_user')) {
      return { ok: true, status: 200, json: async () => ({ message: 'viewer@x.org' }) };
    }
    const { query } = body;
    calls.push({ method: 'graphql', query: (query?.match(/query (\w+)/) || [, '?'])[1] });
    const empty = { totalCount: 0, edges: [] };
    const employees = {
      totalCount: team.length,
      edges: team.map((e) => ({
        node: {
          name: e.id, employee_name: e.name, designation: { name: 'Business Executive' }, reports_to: { name: null },
          custom_territory: { name: 'HQ-Erode' }, user_id: { name: e.email ?? null }, custom_role_profile__name: null,
        },
      })),
    };
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { Employees: employees, RoleProfiles: empty, Quotations: empty, LeaveApplications: empty } }),
    };
  }));
  return calls;
}

const run = (month = '2026-09', extra = {}) => fetchVisitDataset({
  anchorDate: '2026-09-30', month, monthTo: month, gqlToken: 'token a:b', ...extra,
});

afterEach(() => vi.unstubAllGlobals());

describe('visits counted on the server', () => {
  it('asks for the window once, with the Sales roster, and never for raw visit rows', async () => {
    clearVisitCache();
    const calls = stubErp({ team: [{ id: 'E1', name: 'Ravi', email: 'ravi@x.org' }] });
    await run();
    const summaries = calls.filter((c) => c.method === 'summary');
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ from: '2026-09-01', to: '2026-09-30', sales: [['E1', 'ravi@x.org']] });
    expect(calls.some((c) => c.query === 'VisitsInWindow')).toBe(false);
  });

  it('reads each count line as the visits it stands for', async () => {
    clearVisitCache();
    stubErp({ perDay: 40 });
    const out = await run();
    // 30 days x 40 visits, from 30 lines
    expect(out.rows).toHaveLength(30);
    expect(planned(out.rows)).toBe(1200);
    expect(happened(out.rows)).toBe(1200);
    expect(visitsByHour(out.rows)[10].verified).toBe(1200);
    expect(out.countsOnly).toBe(true);
  });

  it('is never truncated — the server counts the whole window', async () => {
    clearVisitCache();
    stubErp({ perDay: 5000 });
    const out = await run();
    expect(out.truncated).toEqual({ visits: false, pob: false });
  });
});

describe('request caching', () => {
  it('refetches only what the month actually changes', async () => {
    clearVisitCache();
    const calls = stubErp();
    await run('2026-09');
    expect(calls.map((c) => c.query)).toContain('ActiveEmployees');
    expect(calls.map((c) => c.query)).toContain('RoleProfileTree');

    calls.length = 0;
    await run('2026-08');
    await run('2026-07');
    const asked = calls.map((c) => c.query);
    expect(asked).not.toContain('ActiveEmployees');
    expect(asked).not.toContain('RoleProfileTree');
  });

  it('keys the cache on the token, so one viewer never sees another roster', async () => {
    clearVisitCache();
    const calls = stubErp();
    await run();
    calls.length = 0;
    await run('2026-09', { gqlToken: 'token other:x' });
    expect(calls.map((c) => c.query)).toContain('ActiveEmployees');
  });

  it('does not cache a failure', async () => {
    clearVisitCache();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ exc_type: 'ServerError' }) })));
    await expect(run()).rejects.toThrow();
    const calls = stubErp();
    await run();
    expect(calls.map((c) => c.query)).toContain('ActiveEmployees');
  });
});

describe('waves', () => {
  it('today inside the window: the window, then the money — today is not counted twice', async () => {
    clearVisitCache();
    const calls = stubErp();
    const waves = [];
    const out = await run('2026-09', { onWave: (d) => waves.push(d) });
    expect(waves.map((w) => w.ready)).toEqual([
      { today: true, window: true, pob: false },
      { today: true, window: true, pob: true },
    ]);
    expect(calls.filter((c) => c.method === 'summary')).toHaveLength(1);
    expect(planned(out.rows)).toBe(30);
  });

  it('a past month: today first, then the window, then the money — and today is kept', async () => {
    clearVisitCache();
    const calls = stubErp();
    const waves = [];
    const out = await run('2026-08', { onWave: (d) => waves.push(d) });
    expect(waves.map((w) => w.ready)).toEqual([
      { today: true, window: false, pob: false },
      { today: true, window: true, pob: false },
      { today: true, window: true, pob: true },
    ]);
    expect(waves[0].rows.every((r) => r.plannedDate === '2026-09-30')).toBe(true);
    expect(calls.filter((c) => c.method === 'summary').map((c) => `${c.from}..${c.to}`).sort()).toEqual([
      '2026-08-01..2026-08-31',
      '2026-09-30..2026-09-30',
    ]);
    expect(planned(out.rows)).toBe(32);
  });

  it('holds the money back rather than reporting it as zero', async () => {
    clearVisitCache();
    stubErp();
    const waves = [];
    await run('2026-09', { onWave: (d) => waves.push(d) });
    expect(waves[0].pob).toEqual([]);
    expect(waves[0].ready.pob).toBe(false);
    expect(waves.at(-1).ready.pob).toBe(true);
  });

  it('works with no onWave at all', async () => {
    clearVisitCache();
    stubErp();
    const out = await run();
    expect(planned(out.rows)).toBe(30);
  });
});

describe('the rows behind a list', () => {
  it('asks elbrit_visit_rows for exactly that list, with the roster, and attributes the rows', async () => {
    clearVisitCache();
    const calls = stubErp({ team: [{ id: 'E1', name: 'Ravi', email: 'ravi@x.org' }] });
    const out = await run();
    const rows = await out.loadRows({ mode: 'plan', member: 'E1', from: '2026-09-01', to: '2026-09-30' });
    expect(calls.find((c) => c.method === 'rows')).toMatchObject({
      mode: 'plan', member: 'E1', from: '2026-09-01', to: '2026-09-30', sales: [['E1', 'ravi@x.org']],
    });
    expect(rows[0]).toMatchObject({ eventId: 'EV1', employeeId: 'E1', participantId: 'E1', employeeName: 'Ravi' });
  });
});
