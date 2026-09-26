'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dropdown } from 'primereact/dropdown';
import { Button, Field, SegmentedControl } from '@/design-system';
import { DROPDOWN_STYLE, FieldLabel, RailSection } from './RailSection';

const KINDS = [
  { id: 'user', label: 'A user' },
  { id: 'token', label: 'Token' },
  { id: 'registry', label: 'Env row' },
];

/* WHO THE SCREEN RUNS AS. Pick anyone from the ERP; the harness uses their
   remembered token, mints one with the admin token (test ERPs only), or
   takes one you paste. The ERP's own answer — who the token really is —
   is shown underneath, so a wrong token is obvious. */
export function IdentityPanel({ identity }) {
  const { env, acting, actAs, people, loadPeople, tokens, who } = identity;
  const kind = acting?.kind ?? 'registry';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [paste, setPaste] = useState('');
  useEffect(() => setError(null), [acting?.email, kind, env?.name]);

  useEffect(() => {
    if (kind === 'user' && env && !people.list.length && !people.loading && !people.error) loadPeople();
  }, [kind, env, people, loadPeople]);

  const options = useMemo(
    () =>
      people.list.map((p) => ({
        value: p.email,
        label: `${p.name} · ${p.seat || p.roleProfile || p.email}`,
        search: `${p.name} ${p.email} ${p.seat ?? ''} ${p.roleProfile ?? ''} ${p.designation ?? ''}`,
      })),
    [people.list],
  );

  const selected = kind === 'user' ? acting.email : null;
  const hasToken = selected ? Boolean(tokens[selected]) : false;

  const mint = async () => {
    setBusy(true);
    setError(null);
    try {
      await identity.mintFor(selected);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const whoLine = who.checking
    ? 'Checking with ERP…'
    : who.email
      ? `ERP says: ${who.email}`
      : who.error
        ? `Token refused: ${who.error.message}`
        : 'No token';
  const mismatch = kind === 'user' && who.email && selected && who.email.toLowerCase() !== selected.toLowerCase();

  return (
    <RailSection title="Acting as" aside={who.email ? who.email.split('@')[0] : null}>
      <SegmentedControl items={KINDS} value={kind} onChange={(k) => actAs(k === 'user' ? { kind: 'user', email: selected ?? '' } : k === 'token' ? { kind: 'token', token: acting?.token ?? '' } : { kind: 'registry' })} ariaLabel="Identity source" />

      {kind === 'user' ? (
        <>
          <div className="ds-field-wrap ds-field-wrap--block">
            <FieldLabel htmlFor="harness-person">Person</FieldLabel>
            <Dropdown
              unstyled
              inputId="harness-person"
              value={selected}
              onChange={(e) => actAs({ kind: 'user', email: e.value })}
              options={options}
              optionLabel="label"
              optionValue="value"
              filter
              filterBy="search"
              placeholder={people.loading ? 'Loading people…' : people.error ? 'Could not list people' : 'Search name, email, seat…'}
              className="w-full"
              style={DROPDOWN_STYLE}
              virtualScrollerOptions={options.length > 80 ? { itemSize: 36 } : undefined}
            />
            {people.error ? <p className="mt-1 text-10 text-danger-text">{people.error.message}</p> : null}
            <button type="button" onClick={loadPeople} className="mt-1 text-10 text-brand-text">Reload people</button>
          </div>
          {selected ? (
            hasToken ? (
              <div className="flex items-center justify-between gap-2 text-11">
                <span className="text-ds-secondary">Using their remembered token.</span>
                <button type="button" onClick={() => identity.forgetToken(selected)} className="text-10 text-danger-text">Forget</button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Field
                  label="Their token"
                  type="password"
                  placeholder="key:secret"
                  value={paste}
                  onChange={setPaste}
                  onBlur={() => paste.trim() && identity.rememberToken(selected, paste.trim())}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  hint={env?.production ? "Production: the harness never changes anyone's keys — paste a token this user already has." : 'Paste one they already have, or mint one below.'}
                />
                {env?.production ? null : (
                  <div className="flex flex-col gap-1">
                    <Button type="default" size="sm" loading={busy} onClick={mint}>
                      Mint a token for them
                    </Button>
                    <p className="text-10 text-ds-muted">Replaces their API secret on {env?.name ?? 'this ERP'} (test ERPs only). Remembered here.</p>
                  </div>
                )}
              </div>
            )
          ) : null}
        </>
      ) : null}

      {kind === 'token' ? (
        <Field
          label="Token"
          type="password"
          placeholder="key:secret"
          value={acting?.token ?? ''}
          onChange={(v) => actAs({ kind: 'token', token: v.trim() })}
          hint="Any ERP token. The screen runs as whoever it belongs to."
        />
      ) : null}

      {kind === 'registry' ? <p className="text-11 text-ds-secondary">The /tokens row&apos;s own token for {env?.name ?? 'this ERP'}.</p> : null}

      <p className={`text-11 ${who.error || mismatch ? 'text-danger-text' : 'text-ds-secondary'}`}>
        {whoLine}
        {mismatch ? ' — not the person picked' : ''}
      </p>
      {error ? <p className="text-11 text-danger-text">{error}</p> : null}
    </RailSection>
  );
}
