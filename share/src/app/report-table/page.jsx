'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import { SmartDataProvider } from '@/components/SmartDataTable/SmartDataProvider';
import { SmartDataTable } from '@/components/SmartDataTable/SmartDataTable';
import { useSmartDataStore } from '@/components/SmartDataTable/useSmartDataStore';
import { useSmartDataContext } from '@/components/SmartDataTable/SmartDataContext';
import { PipelineDebugViewer } from '@/components/SmartDataTable/PipelineDebugViewer';
import { Splitter, SplitterPanel } from 'primereact/splitter';
import ReportsConfigSidebar from './components/ReportsConfigSidebar';
import { ReportControls } from './components/ReportControls';
import dayjs from 'dayjs';
import { useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function deserializeReportConfig(jsString) {
  if (!jsString?.trim()) return null;
  try {
    const code = jsString.trim().replace(/;\s*$/, '').trim();
    return new Function('return (' + code + ')')();
  } catch {
    return null;
  }
}

function RefreshButton() {
  const { refresh, lastFetchedAt } = useSmartDataContext();
  const isLoading = useSmartDataStore(state => Object.values(state.views).some(v => v.loading));
  const [hovered, setHovered] = useState(false);
  const label = isLoading
    ? 'Refreshing'
    : lastFetchedAt
      ? dayjs(lastFetchedAt).format('D MMM YY HH:mm')
      : '';
  return (
    <button
      type="button"
      onClick={refresh}
      disabled={isLoading}
      className="flex items-center gap-1.5 px-3 h-8 border rounded-md bg-white text-gray-600"
      style={{
        borderColor: hovered && !isLoading ? '#06b6d4' : '#d1d5db',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <i className={isLoading ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'} style={{ fontSize: '0.75rem' }} />
      {label && <span style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{label}</span>}
    </button>
  );
}

function ReportTable({ reportConfig }) {
  const viewEntries = Object.entries(reportConfig.views ?? {});
  const viewIds = viewEntries.map(([id]) => id);
  const searchParams = useSearchParams();
  const isDebug = searchParams.get('debug') === 'true';

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-[1600px] mx-auto px-4 py-8 flex flex-col gap-8">
        <SmartDataProvider reportConfig={reportConfig} config={reportConfig.tableConfig}>

        {isDebug && <PipelineDebugViewer />}
        
          <div className="flex items-center gap-4">
            <ReportControls controls={reportConfig.controls ?? []} viewIds={viewIds} />
            <RefreshButton />
          </div>

          {viewEntries.map(([viewId, { name, view, tableConfig: viewTableConfig }]) => (
            <section key={viewId} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-medium text-gray-800 mb-4">{name}</h2>
              <SmartDataTable viewId={viewId} view={view} loadingMessage={`Fetching ${name}…`} config={viewTableConfig} />
            </section>
          ))}

        </SmartDataProvider>
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
