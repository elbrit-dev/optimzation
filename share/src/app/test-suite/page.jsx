import fs from 'fs';
import path from 'path';
import Link from 'next/link';

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function MetricCard({ label, value, sub, colorClass = 'text-gray-800' }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <span className={`text-3xl font-bold ${colorClass}`}>{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

function CoverageBar({ pct }) {
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
      <div className={`${color} h-1.5 rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function StatusDot({ status }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
        status === 'passed' ? 'bg-green-500' : status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
      }`}
    />
  );
}

function FileCard({ result, projectRoot }) {
  const relName = result.name.replace(projectRoot, '').replace(/^[\\/]/, '').replace(/\\/g, '/');
  const passing = result.numPassingAssertions ?? result.assertionResults?.filter((t) => t.status === 'passed').length ?? 0;
  const failing = result.numFailingAssertions ?? result.assertionResults?.filter((t) => t.status === 'failed').length ?? 0;
  const total = (result.assertionResults?.length) ?? passing + failing;
  const allPass = failing === 0;

  return (
    <details className="group bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <summary className="flex items-center justify-between px-5 py-3.5 cursor-pointer select-none list-none hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold ${
              allPass ? 'bg-green-500' : 'bg-red-500'
            }`}
          >
            {allPass ? '✓' : '✗'}
          </span>
          <span className="text-xs text-gray-500 font-mono truncate">{relName}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          <span className="text-xs text-green-600 font-medium">{passing} passed</span>
          {failing > 0 && <span className="text-xs text-red-600 font-medium">{failing} failed</span>}
          <span className="text-xs text-gray-400">{total} total</span>
          <svg
            className="w-3.5 h-3.5 text-gray-400 transition-transform group-open:rotate-90"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </summary>

      {result.assertionResults?.length > 0 && (
        <ul className="border-t border-gray-100 divide-y divide-gray-50 px-5 py-1">
          {result.assertionResults.map((t, i) => (
            <li key={i} className="flex items-start gap-2.5 py-2">
              <StatusDot status={t.status} />
              <div className="min-w-0">
                {t.ancestorTitles?.length > 0 && (
                  <span className="text-xs text-gray-400 mr-1">{t.ancestorTitles.join(' › ')} ›</span>
                )}
                <span className="text-xs text-gray-700">{t.title}</span>
                {t.failureMessages?.length > 0 && (
                  <pre className="mt-1 text-xs text-red-600 bg-red-50 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                    {t.failureMessages[0]}
                  </pre>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export default function TestSuitePage() {
  const projectRoot = process.cwd();
  const results = readJson(path.join(projectRoot, 'public', 'test-results.json'));
  const coverage = readJson(path.join(projectRoot, 'public', 'coverage-summary.json'));
  const cov = coverage?.total;

  if (!results) {
    return (
      <div className="min-h-screen bg-gray-50">
        <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8">
          <div className="mb-6">
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
              ← Home
            </Link>
            <h1 className="text-2xl font-semibold text-gray-900 mt-2">Test Suite</h1>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <div className="text-gray-400 text-5xl mb-4">⬡</div>
            <h2 className="text-lg font-medium text-gray-700 mb-2">No test results yet</h2>
            <p className="text-sm text-gray-500 mb-4">
              Run the following command to generate test results and coverage data:
            </p>
            <code className="inline-block bg-gray-100 text-gray-800 text-sm font-mono px-4 py-2 rounded-md">
              pnpm test:generate
            </code>
            <p className="text-xs text-gray-400 mt-3">
              Results are also generated automatically on every <code className="bg-gray-100 px-1 rounded">pnpm build</code>.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const runDate = results.startTime ? new Date(results.startTime) : null;
  const totalDuration = results.testResults?.reduce((sum, r) => sum + ((r.endTime ?? 0) - (r.startTime ?? 0)), 0) ?? 0;
  const durationLabel = totalDuration > 1000 ? `${(totalDuration / 1000).toFixed(1)}s` : `${totalDuration}ms`;

  const overallPass = results.success !== false && (results.numFailedTests ?? 0) === 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
              ← Home
            </Link>
            <h1 className="text-2xl font-semibold text-gray-900 mt-1">Test Suite</h1>
          </div>
          <div className="flex items-center gap-3">
            {runDate && (
              <span className="text-sm text-gray-500">
                Last run:{' '}
                {runDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}{' '}
                {runDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${
                overallPass
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${overallPass ? 'bg-green-500' : 'bg-red-500'}`} />
              {overallPass ? 'PASS' : 'FAIL'}
            </span>
          </div>
        </div>

        {/* Summary metrics */}
        <section>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Summary</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard
              label="Total Tests"
              value={results.numTotalTests ?? '—'}
              sub={`${results.numTotalTestSuites ?? '?'} suites`}
            />
            <MetricCard
              label="Passed"
              value={results.numPassedTests ?? '—'}
              sub={
                results.numTotalTests
                  ? `${Math.round(((results.numPassedTests ?? 0) / results.numTotalTests) * 100)}%`
                  : undefined
              }
              colorClass="text-green-600"
            />
            <MetricCard
              label="Failed"
              value={results.numFailedTests ?? '—'}
              colorClass={(results.numFailedTests ?? 0) > 0 ? 'text-red-600' : 'text-gray-800'}
            />
            <MetricCard label="Duration" value={durationLabel} />
          </div>
        </section>

        {/* Coverage metrics */}
        {cov && (
          <section>
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Coverage</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Statements', key: 'statements' },
                { label: 'Branches', key: 'branches' },
                { label: 'Functions', key: 'functions' },
                { label: 'Lines', key: 'lines' },
              ].map(({ label, key }) => {
                const d = cov[key];
                if (!d) return null;
                const pct = typeof d.pct === 'number' ? d.pct : 0;
                return (
                  <div key={key} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
                    <div className="flex items-end gap-1 mt-1">
                      <span
                        className={`text-3xl font-bold ${
                          pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600'
                        }`}
                      >
                        {pct.toFixed(1)}
                      </span>
                      <span className="text-lg font-medium text-gray-400 mb-0.5">%</span>
                    </div>
                    <CoverageBar pct={pct} />
                    <span className="text-xs text-gray-400 mt-1 block">
                      {d.covered}/{d.total}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Per-file results */}
        {results.testResults?.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
              Test Files{' '}
              <span className="font-normal normal-case text-gray-400">
                ({results.testResults.length})
              </span>
            </h2>
            <div className="flex flex-col gap-2">
              {results.testResults.map((result, i) => (
                <FileCard key={i} result={result} projectRoot={projectRoot} />
              ))}
            </div>
          </section>
        )}

      </main>
    </div>
  );
}
