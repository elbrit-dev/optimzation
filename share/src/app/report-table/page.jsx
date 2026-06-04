'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import { SmartDataProviderImpl, deserializeReportConfig } from '@/components/SmartDataTable/SmartDataProvider';
import { SmartDataTable } from '@/components/SmartDataTable/SmartDataTable';
import { useSmartDataContext } from '@/components/SmartDataTable/SmartDataContext';
import { PipelineDebugViewer } from '@/components/SmartDataTable/PipelineDebugViewer';
import { Splitter, SplitterPanel } from 'primereact/splitter';
import ReportsConfigSidebar from './components/ReportsConfigSidebar';
import { ReportControls } from './components/ReportControls';
import { useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// Resolves per-view config from context and renders the view section.
function ViewSection({ viewId, viewCfg }) {
  const { resolveView } = useSmartDataContext();
  const { resolvedTable, resolvedControls } = resolveView(viewId);
  const { name, view } = viewCfg;

  return (
    <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-medium text-gray-800 mb-4">{name}</h2>
      {resolvedControls?.length > 0 && (
        <div className="mb-3">
          <ReportControls controls={resolvedControls} viewIds={[viewId]} />
        </div>
      )}
      <SmartDataTable viewId={viewId} view={view} loadingMessage={`Fetching ${name}…`} config={resolvedTable} />
    </section>
  );
}

function ReportTable({ reportConfig }) {
  const viewEntries  = Object.entries(reportConfig.views ?? {});
  const rootControls = reportConfig.controls ?? [];
  const rootViewIds  = viewEntries.filter(([, v]) => v.type !== 'drawer').map(([id]) => id);
  const searchParams = useSearchParams();
  const isDebug = searchParams.get('debug') === 'true';

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-[1600px] mx-auto px-4 py-8 flex flex-col gap-8">
        <SmartDataProviderImpl reportConfig={reportConfig}>

          {isDebug && <PipelineDebugViewer />}

          {rootControls.length > 0 && (
            <ReportControls controls={rootControls} viewIds={rootViewIds} />
          )}

          {viewEntries.map(([viewId, viewCfg]) => (
            <ViewSection key={viewId} viewId={viewId} viewCfg={viewCfg} />
          ))}

        </SmartDataProviderImpl>
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
      <i className="pi pi-file-edit text-6xl text-gray-300 mb-4" />
      <h3 className="text-lg font-semibold text-gray-700 mb-2">No Config Selected</h3>
      <p className="text-sm text-gray-500 max-w-sm">
        Choose a config from the sidebar to load the report.
      </p>
    </div>
  );
}

function ReportTablePage() {
  const [activeConfig, setActiveConfig] = useState(null);
  const [configKey, setConfigKey] = useState(0);

  const handleConfigLoad = useCallback((configString) => {
    const cfg = deserializeReportConfig(configString);
    if (!cfg) return;
    setActiveConfig(cfg);
    setConfigKey(k => k + 1);
  }, []);

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 65px)' }}>
      <Splitter style={{ height: '100%' }} layout="horizontal" className="flex-1 min-h-0">
        <SplitterPanel className="flex flex-col min-w-0 overflow-auto" size={80} minSize={30}>
          {activeConfig ? (
            <ReportTable key={configKey} reportConfig={activeConfig} />
          ) : (
            <EmptyState />
          )}
        </SplitterPanel>
        <SplitterPanel className="flex flex-col min-w-0 overflow-hidden" size={20} minSize={2}>
          <ReportsConfigSidebar onConfigLoad={handleConfigLoad} />
        </SplitterPanel>
      </Splitter>
    </div>
  );
}

export default function ReportTablePageRoute() {
  return (
    <ProtectedRoute>
      <ReportTablePage />
    </ProtectedRoute>
  );
}
