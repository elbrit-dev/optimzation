import * as Sentry from '@sentry/nextjs';
import Error from 'next/error';

/* Next's own error page, unchanged to look at; it only reports the error to
   Sentry first (instrumentation-client.js). */
function ErrorPage({ statusCode }) {
  return <Error statusCode={statusCode} />;
}

ErrorPage.getInitialProps = async (contextData) => {
  // Awaited so the event leaves before a server instance can be stopped.
  await Sentry.captureUnderscoreErrorException(contextData);
  return Error.getInitialProps(contextData);
};

export default ErrorPage;
