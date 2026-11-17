import { useRouter } from 'next/router';
import Head from 'next/head';
import { DeviceCheck } from '@/app/device-check/components/DeviceCheck';
import { safeNext } from '@/app/device-check/lib/checks';

/* /device-check?next=/login[&auto=1] — host route for the browser checklist
   (share/src/app/device-check, built in Elbrit-Play). Checks mobile view,
   location not blocked, cookies / localStorage / sessionStorage / IndexedDB,
   free storage; then continues to `next` (same-origin paths only, default /).
   A file route, so it wins over the Plasmic catch-all. */

export default function DeviceCheckPage() {
  const { query, isReady } = useRouter();
  if (!isReady) return null;
  const next = safeNext(Array.isArray(query.next) ? query.next[0] : query.next, '/');
  return (
    <>
      <Head>
        <title>Check your phone · Elbrit One</title>
      </Head>
      <main className="min-h-dvh bg-page">
        <DeviceCheck continueUrl={next} autoContinue={query.auto === '1'} />
      </main>
    </>
  );
}
