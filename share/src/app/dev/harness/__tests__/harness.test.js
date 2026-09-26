import { describe, expect, it, vi } from 'vitest';
import { controlsFor, parseObject, resolveProps, toSource } from '../lib/props';
import { authHeader, listPeople, mintToken, whoIs } from '../lib/erp';
import { secondaryEntryMeta } from '@/app/secondary-entry/plasmic.meta';
import { secondaryApprovalMeta } from '@/app/secondary-approval/plasmic.meta';
import { visitReportMeta } from '@/app/visit/plasmic.meta';
import { ringNavMeta } from '@/app/ring-nav/plasmic.meta';
import { RING_NAV_MOCK } from '../entries/ringNav';

describe('props from the Plasmic registration', () => {
  it('draws one control per registered prop, marking the bound ones', () => {
    const controls = controlsFor(secondaryEntryMeta, { bound: { gqlToken: 't', gqlEnvironment: 'UAT' }, hidden: ['className'] });
    expect(controls.map((c) => c.name)).toEqual(Object.keys(secondaryEntryMeta.props).filter((n) => n !== 'className'));
    expect(controls.find((c) => c.name === 'gqlToken').bound).toBe(true);
    expect(controls.find((c) => c.name === "onSaved").type).toBe("eventHandler");
    expect(controls.find((c) => c.name === 'rows').advanced).toBe(true);
  });

  it('passes bound values, overrides, defaults, and logs event handlers', () => {
    const log = vi.fn();
    const { props } = resolveProps(secondaryApprovalMeta, {
      values: { title: 'Mine', gqlToken: 'hand-typed' },
      bound: { gqlToken: 'from-identity', gqlEnvironment: 'UAT' },
      overridden: [],
      defaults: { bottomGap: '11rem' },
      log,
    });
    expect(props).toMatchObject({ title: 'Mine', gqlToken: 'from-identity', gqlEnvironment: 'UAT', bottomGap: '11rem' });
    expect(props).not.toHaveProperty('viewer');
    props.onDecided({ n: 1 });
    expect(log).toHaveBeenCalledWith('onDecided', [{ n: 1 }]);

    const over = resolveProps(secondaryApprovalMeta, { values: { gqlToken: 'hand-typed' }, bound: { gqlToken: 'auto' }, overridden: ['gqlToken'] });
    expect(over.props.gqlToken).toBe('hand-typed');
  });

  it('uses the registered defaultValue when unset, and reports bad JSON', () => {
    expect(resolveProps(visitReportMeta, {}).props.gqlEnvironment).toBe('ERP');
    expect(parseObject('{').error).toBeTruthy();
    const { props, errors } = resolveProps(secondaryEntryMeta, { values: { rows: '[{"name":"A"}]' } });
    expect(props.rows).toEqual([{ name: 'A' }]);
    expect(resolveProps(secondaryEntryMeta, { values: { rows: '[' } }).errors.rows).toBeTruthy();
    expect(errors).toEqual({});
  });
});

describe('Ring Nav in the harness', () => {
  it('leaves items unset in ERP mode, so the strip asks the server script', () => {
    const { props } = resolveProps(ringNavMeta, { bound: { gqlToken: 't', gqlEnvironment: 'UAT' } });
    expect(props.items).toBeUndefined();
    expect(props).toMatchObject({ gqlToken: 't', gqlEnvironment: 'UAT' });
    expect(typeof props.onItemClick).toBe('function');
  });

  it('starts Mock with the sample tiles as props, functions and all', () => {
    const { props } = resolveProps(ringNavMeta, { defaults: RING_NAV_MOCK });
    expect(props.items).toBe(RING_NAV_MOCK.items);
    expect(props.data).toEqual(RING_NAV_MOCK.data);
  });

  it('shows a default as source the box can be edited from', () => {
    const text = toSource(RING_NAV_MOCK.items);
    const back = parseObject(text).value;
    expect(back).toHaveLength(RING_NAV_MOCK.items.length);
    expect(back[0].show({ day: 3 })).toBe(true);
    expect(back[0].caption({ data: RING_NAV_MOCK.data })).toBe('14 left');
    const edited = resolveProps(ringNavMeta, { values: { items: '[{ id: "a", label: "A" }]' }, defaults: RING_NAV_MOCK });
    expect(edited.props.items).toEqual([{ id: 'a', label: 'A' }]);
  });
});

describe('ERP identity', () => {
  const fake = (routes) => vi.fn(async (url, init) => {
    const method = String(url).split('/api/method/')[1];
    const body = init?.body ? JSON.parse(init.body) : null;
    const answer = routes(method, body);
    return { ok: true, json: async () => ({ message: answer }) };
  });

  it('asks the ERP whose token it is', async () => {
    const fetchImpl = fake((m) => (m === 'frappe.auth.get_logged_user' ? 'a@x.org' : null));
    expect(await whoIs('https://erp.test', 'k:s', { fetchImpl })).toBe('a@x.org');
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('token k:s');
    expect(authHeader('token k:s')).toBe('token k:s');
  });

  it('lists people with their seats', async () => {
    const fetchImpl = fake((m, b) =>
      b.doctype === 'User'
        ? [{ name: 'b@x.org', full_name: 'Bee', role_profile_name: 'BE4-X' }, { name: 'Administrator' }]
        : [{ name: 'E1', employee_name: 'Bee B', user_id: 'b@x.org', role_id: 'BE4-X' }]);
    expect(await listPeople('https://erp.test', 'admin', { fetchImpl })).toEqual([
      { email: 'b@x.org', name: 'Bee B', roleProfile: 'BE4-X', seat: 'BE4-X', employeeId: 'E1', designation: null },
    ]);
  });

  it('mints on a test ERP, and refuses on production', async () => {
    const fetchImpl = fake((m) =>
      m.endsWith('generate_keys') ? { api_secret: 'sec' } : m === 'frappe.client.get_value' ? { api_key: 'key' } : null);
    expect(await mintToken({ origin: 'https://uat.test', production: false }, 'admin', 'b@x.org', { fetchImpl })).toBe('key:sec');
    await expect(mintToken({ origin: 'https://erp.elbrit.org', production: true }, 'admin', 'b@x.org', { fetchImpl })).rejects.toThrow(/production/);
  });
});
