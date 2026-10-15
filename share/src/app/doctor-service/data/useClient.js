'use client';

/* The client the form and pages talk through.
 *
 *   sampleData        an in-memory client (sample.js) — Studio, the harness
 *   url + token       the doctor page's own binding (DoctorDetail's props)
 *   gqlToken + gqlEnvironment   the share screens' binding, the /tokens
 *                     registry row resolved like Secondary Approval does
 *
 * → { client, error } — client is null until the endpoint is known. */

import { useEffect, useMemo, useState } from 'react';
import { getEndpointConfigFromUrlKeyAsync } from '@/app/graphql-playground/constants';
import { makeClient } from './api';
import { makeSampleClient } from './sample';

export function useServiceClient({ url, token, gqlToken, gqlEnvironment = 'ERP', sampleData, sampleRole }) {
  const credential = token || gqlToken;
  const sample = useMemo(() => (sampleData ? makeSampleClient(sampleRole) : null), [sampleData, sampleRole]);
  const [state, setState] = useState({ client: null, error: null });

  useEffect(() => {
    if (sample) return undefined;
    let live = true;
    (async () => {
      try {
        let endpointUrl = url;
        if (!endpointUrl) {
          const cfg = await getEndpointConfigFromUrlKeyAsync(gqlEnvironment);
          endpointUrl = cfg?.endpointUrl;
          if (!endpointUrl) throw new Error(`No ERP endpoint registered for "${gqlEnvironment}".`);
        }
        const client = makeClient({ endpointUrl, token: credential });
        if (live) setState({ client, error: null });
      } catch (error) {
        if (live) setState({ client: null, error });
      }
    })();
    return () => { live = false; };
  }, [sample, url, credential, gqlEnvironment]);

  return sample ? { client: sample, error: null } : state;
}
