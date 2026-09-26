'use client';

import { useEffect, useState } from 'react';
import { Dropdown } from 'primereact/dropdown';
import { Field, Icon, StatusPill } from '@/design-system';
import { listEnvironments } from '../lib/erp';
import { DROPDOWN_STYLE, FieldLabel, RailSection } from './RailSection';

/* Which ERP, and the admin token the harness uses there to list people and
   (not on production) mint their tokens. */
export function EnvironmentPanel({ envName, setEnvName, identity }) {
  const [options, setOptions] = useState([envName]);
  useEffect(() => {
    listEnvironments().then((names) => names.length && setOptions(names));
  }, []);
  const [adminInput, setAdminInput] = useState('');
  const [show, setShow] = useState(false);
  useEffect(() => setAdminInput(identity.adminToken ?? ''), [identity.adminToken, envName]);
  const env = identity.env;

  return (
    <RailSection
      title="Environment"
      aside={env ? <StatusPill status={env.production ? 'danger' : 'success'} showDot={false}>{env.production ? 'Production' : 'Test'}</StatusPill> : null}
    >
      <div className="ds-field-wrap ds-field-wrap--block">
        <FieldLabel htmlFor="harness-env">ERP</FieldLabel>
        <Dropdown
          unstyled
          inputId="harness-env"
          value={envName}
          onChange={(e) => setEnvName(e.value)}
          options={[...new Set([envName, ...options])].map((n) => ({ label: n, value: n }))}
          className="w-full"
          style={DROPDOWN_STYLE}
        />
        <p className="mt-1 truncate text-10 text-ds-muted">{env ? env.origin : identity.envError ? identity.envError.message : 'Resolving…'}</p>
      </div>
      <Field
        label="Admin token"
        type={show ? 'text' : 'password'}
        placeholder="key:secret"
        value={adminInput}
        onChange={setAdminInput}
        onBlur={() => identity.setAdminToken(adminInput.trim())}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        hint={
          env?.production
            ? 'Lists people here. Production never mints tokens — paste a user’s own.'
            : 'Lists people and mints their tokens here. Kept in this browser only.'
        }
        suffix={
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide token' : 'Show token'} className="flex items-center text-ds-secondary">
            <Icon name={show ? 'eye-slash' : 'eye'} size="sm" />
          </button>
        }
      />
    </RailSection>
  );
}
