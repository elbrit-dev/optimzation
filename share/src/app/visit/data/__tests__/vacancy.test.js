import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/graphql-playground/constants', () => ({
  getEndpointConfigFromUrlKeyAsync: async () => ({ endpointUrl: 'https://erp.example.com/api/method/graphql' }),
}));

const { fetchVisitDataset, clearVisitCache } = await import('../liveSource');

/* ERPNext has no vacancy FIELD. HR's workaround is a placeholder Employee on
   a "V…" naming series, kept Active so the chain below it does not dangle —
   so reading a seat as vacant is a guess made from an id and a name, and
   getting it wrong drops a real person out of every headcount on the screen.
   These pin the guess against the shapes the live roster actually holds. */

function stub(employees) {
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    /* The visits are counted server-side now; an empty month is enough here. */
    if (String(_url).endsWith('/elbrit_visit_summary')) {
      return { ok: true, status: 200, json: async () => ({ message: { employees: [], days: [], hqs: [], rows: [] } }) };
    }
    if (String(_url).includes('get_logged_user')) return { ok: true, status: 200, json: async () => ({ message: null }) };
    const { query } = JSON.parse(init.body);
    const empty = { totalCount: 0, edges: [] };
    if (query.includes('Employees(')) {
      return {
        status: 200,
        json: async () => ({
          data: {
            Employees: {
              totalCount: employees.length,
              edges: employees.map((e) => ({
                node: {
                  name: e.id,
                  employee_name: e.name,
                  designation: { name: 'Business Executive' },
                  reports_to: { name: null },
                  custom_hq: { name: 'HQ-Erode' },
                  user_id: { name: null },
                  custom_role_profile__name: 'Sales - BE',
                },
              })),
            },
          },
        }),
      };
    }
    if (query.includes('RoleProfiles(')) {
      return {
        status: 200,
        json: async () => ({ data: { RoleProfiles: { totalCount: 1, edges: [
          { node: { name: 'Sales - BE', parent_role_profile: { name: null } } },
        ] } } }),
      };
    }
    return { status: 200, json: async () => ({ data: { Events: empty, Quotations: empty, LeaveApplications: empty } }) };
  }));
}

const load = () => fetchVisitDataset({
  anchorDate: '2026-09-23', month: '2026-09', monthTo: '2026-09', gqlToken: 'token a:b',
});

async function vacancyOf(employees) {
  clearVisitCache();
  stub(employees);
  const out = await load();
  return new Map(out.team.map((m) => [m.id, m.vacant]));
}

describe('reading a seat as vacant', () => {
  it('takes the V-series id as the signal', async () => {
    const seats = await vacancyOf([
      { id: 'V01617', name: 'Vacant_Somebody' },
      { id: 'E01257', name: 'Sreejith K' },
    ]);
    expect(seats.get('V01617')).toBe(true);
    expect(seats.get('E01257')).toBe(false);
  });

  it('does not read a real employee as an empty seat for starting with V', async () => {
    /* The rule was /^v/i on the id. Every live placeholder is V followed by
       digits and every real employee is on the E-series, but a "VK…" id would
       have emptied a real person out of every count on the screen. */
    const seats = await vacancyOf([{ id: 'VK0042', name: 'Vignesh Kumar S' }]);
    expect(seats.get('VK0042')).toBe(false);
  });

  it('reads the name fallback through the typing the live records carry', async () => {
    /* Both of these are real: a space before the underscore, and a leading
       tab that the anchored pattern could not match at all. They matter only
       for a placeholder still on its original HR-EMP id — which is the one
       case this fallback exists for. */
    const seats = await vacancyOf([
      { id: 'HR-EMP-00021', name: 'Vacant _ Amit Kumar Thakur' },
      { id: 'HR-EMP-00022', name: '\tVacant_Marimuthu K(E00886)' },
      { id: 'HR-EMP-00023', name: 'Vacantly Named Person' },
    ]);
    expect(seats.get('HR-EMP-00021')).toBe(true);
    expect(seats.get('HR-EMP-00022')).toBe(true);
    // "Vacantly" is a name, not a placeholder: the underscore is the marker.
    expect(seats.get('HR-EMP-00023')).toBe(false);
  });
});
