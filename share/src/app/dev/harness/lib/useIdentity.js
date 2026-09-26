'use client';

/* WHO THE SCREEN RUNS AS, per environment.
 *
 *   acting as   'registry'  the environment row's own token (a harness
 *                           convenience, as the old /visit page had)
 *               'user'      any ERP user — their token remembered here, or
 *                           minted with the admin token (not on production)
 *               'token'     a token pasted by hand
 *
 * Every piece is stored PER ENVIRONMENT and only used once that
 * environment has resolved, so a token is never sent to another
 * environment's host (switching UAT → ERP used to send UAT's key to
 * production for a moment). The ERP is asked who the token belongs to, and
 * the answer is what the harness shows. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { listPeople, mintToken, resolveEnvironment, whoIs } from './erp';
import { useStoredState } from './storage';

export function useIdentity(envName) {
  const [env, setEnv] = useState({ name: null, resolved: null, error: null });
  useEffect(() => {
    let stale = false;
    setEnv({ name: envName, resolved: null, error: null });
    resolveEnvironment(envName)
      .then((resolved) => !stale && setEnv({ name: envName, resolved, error: null }))
      .catch((error) => !stale && setEnv({ name: envName, resolved: null, error }));
    return () => {
      stale = true;
    };
  }, [envName]);
  const resolved = env.name === envName ? env.resolved : null;

  const [adminToken, setAdminToken] = useStoredState(`admin.${envName}`, '');
  const [tokens, setTokens] = useStoredState(`tokens.${envName}`, {});
  const [acting, setActing] = useStoredState(`acting.${envName}`, { kind: 'registry' });

  /* The token the screen gets. */
  const token = useMemo(() => {
    if (!resolved) return '';
    if (acting?.kind === 'user') return tokens?.[acting.email] ?? '';
    if (acting?.kind === 'token') return acting.token ?? '';
    return resolved.registryToken ?? '';
  }, [resolved, acting, tokens]);

  /* Whose it is, per the ERP. */
  const [who, setWho] = useState({ token: null, email: null, error: null, checking: false });
  useEffect(() => {
    if (!resolved || !token) {
      setWho({ token, email: null, error: null, checking: false });
      return undefined;
    }
    let stale = false;
    setWho({ token, email: null, error: null, checking: true });
    whoIs(resolved.origin, token)
      .then((email) => !stale && setWho({ token, email, error: null, checking: false }))
      .catch((error) => !stale && setWho({ token, email: null, error, checking: false }));
    return () => {
      stale = true;
    };
  }, [resolved, token]);

  /* The people you can act as (admin token, else the registry token). */
  const [people, setPeople] = useState({ list: [], loading: false, error: null });
  const loadPeople = useCallback(async () => {
    if (!resolved) return;
    const t = adminToken || resolved.registryToken;
    if (!t) {
      setPeople({ list: [], loading: false, error: new Error('Add an admin token to list people.') });
      return;
    }
    setPeople((p) => ({ ...p, loading: true, error: null }));
    try {
      setPeople({ list: await listPeople(resolved.origin, t), loading: false, error: null });
    } catch (error) {
      setPeople({ list: [], loading: false, error });
    }
  }, [resolved, adminToken]);
  useEffect(() => {
    setPeople({ list: [], loading: false, error: null });
  }, [envName]);

  const actAs = useCallback((next) => setActing(next), [setActing]);

  const rememberToken = useCallback(
    (email, t) => setTokens((prev) => ({ ...(prev ?? {}), [email]: t })),
    [setTokens],
  );
  const forgetToken = useCallback(
    (email) =>
      setTokens((prev) => {
        const next = { ...(prev ?? {}) };
        delete next[email];
        return next;
      }),
    [setTokens],
  );

  /* Mint (non-production) and act as `email`. */
  const mintFor = useCallback(
    async (email) => {
      if (!resolved) throw new Error('Environment not resolved yet.');
      if (!adminToken) throw new Error('Add an admin token for this environment first.');
      const t = await mintToken(resolved, adminToken, email);
      rememberToken(email, t);
      setActing({ kind: 'user', email });
      return t;
    },
    [resolved, adminToken, rememberToken, setActing],
  );

  const person = acting?.kind === 'user' ? people.list.find((p) => p.email === acting.email) ?? { email: acting.email } : null;

  return {
    env: resolved,
    envError: env.name === envName ? env.error : null,
    adminToken,
    setAdminToken,
    acting,
    actAs,
    person,
    token,
    who,
    tokens: tokens ?? {},
    rememberToken,
    forgetToken,
    mintFor,
    people,
    loadPeople,
  };
}
