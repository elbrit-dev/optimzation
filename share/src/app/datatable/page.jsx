'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import { startCase } from 'lodash';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { TabPanel, TabView } from 'primereact/tabview';
import { Splitter, SplitterPanel } from 'primereact/splitter';
import { confirmDialog } from 'primereact/confirmdialog';
import { Toast } from 'primereact/toast';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DataProvider from './components/DataProvider';
import DataTableControls from './components/DataTableControls';
import DataTableNew from './components/DataTableNew';
import DebugDataContext from './components/DebugDataContext';
import ReportLineChartWrapper from './components/ReportLineChartWrapper';
import { useTableOperations } from './contexts/TableOperationsContext';
import { isConfigDirty as checkConfigDirty, getDefaultConfig, getDefaultConfigId, getConfigList, listConfigs, getConfig, resolveFirebaseConfig } from './config/configService';
import { getLocalConfig } from './config/providers/localConfigProvider';
import { configSerialized } from './config/configSerialized';
import { serializeConfigToJs, deserializeJsToConfig } from './config/configSerializer';
import { firestoreService } from '@/app/graphql-playground/services/firestoreService';

const defaultConfig = getDefaultConfig() ?? {};
const isDebugTableContext = process.env.NEXT_PUBLIC_DEBUG_TABLE_CONTEXT === '1';

function DataTablePageContent({ onCellEditComplete, config }) {
  const slotIds = useMemo(() => {
    const slots = config?.slots;
    if (slots && typeof slots === 'object') return Object.keys(slots);
    return ['main'];
  }, [config?.slots]);
  const slotIdForData = slotIds[0] ?? 'main';
  const tableOps = useTableOperations(slotIdForData);
  const {
    rawData,
    isLoading: isLoadingData,
    resolvedConfig,
  } = tableOps;

  const configSlots = resolvedConfig?.slots;
  const showChart = resolvedConfig?.showChart;
  const isMultiSlot = slotIds.length > 1;

  const getSlotTabName = useCallback((slotId) => {
    const slot = configSlots?.[slotId];
    return slot?.name || slot?.displayName || startCase(slotId);
  }, [configSlots]);

  const hasData = rawData && Array.isArray(rawData) && rawData.length > 0;

  if (isLoadingData) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
        <div className="mb-4">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-blue-600"></div>
        </div>
        <p className="text-sm text-gray-500">Loading data...</p>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
        <div className="mb-4">
          <i className="pi pi-table text-6xl text-gray-300"></i>
        </div>
        <h3 className="text-lg font-semibold text-gray-700 mb-2">No Data Available</h3>
        <p className="text-sm text-gray-500 max-w-md">
          Please select a query from the dropdown above and click <strong>Execute</strong> to see the table data.
        </p>
      </div>
    );
  }

  return (
    <>
      {showChart && (
        <div className="w-full mb-4">
          <ReportLineChartWrapper slotId={slotIdForData} />
        </div>
      )}
      {isMultiSlot ? (
        <TabView className="flex-1 flex flex-col min-h-0" renderActiveOnly={false}>
          {slotIds.map((slotId) => (
            <TabPanel key={slotId} header={getSlotTabName(slotId)} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 min-h-0 flex flex-col">
                <DataTableNew
                  slotId={slotId}
                  tableName={slotId}
                  onCellEditComplete={onCellEditComplete}
                />
              </div>
            </TabPanel>
          ))}
        </TabView>
      ) : (
        <DataTableNew
          tableName="main"
          onCellEditComplete={onCellEditComplete}
        />
      )}
    </>
  );
}

function DataTablePage() {
  const toast = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hideTableInDebug, setHideTableInDebug] = useState(false);

  // Single config state (replaces 50+ individual state variables)
  const [configState, setConfigState] = useState(() => defaultConfig);
  const [configApplyKey, setConfigApplyKey] = useState(0);

  // Derive dataSource from config for preset management
  const dataSource = configState.dataSource;

  // Preset management state
  const [configList, setConfigList] = useState(() => getConfigList());
  const [configLoading, setConfigLoading] = useState(false);
  const [firebasePresets, setFirebasePresets] = useState({});
  const [selectedPresetKey, setSelectedPresetKey] = useState(() => {
    const id = getDefaultConfigId();
    return id.startsWith('firebase:') ? id : 'local:' + id;
  });
  const [presetJsValue, setPresetJsValue] = useState('');
  const [presetSaving, setPresetSaving] = useState(false);
  const [saveLocalAsFirebaseDialogVisible, setSaveLocalAsFirebaseDialogVisible] = useState(false);
  const [saveLocalAsFirebaseName, setSaveLocalAsFirebaseName] = useState('');
  const saveLocalAsFirebaseContextRef = useRef(null);

  const offlineData = useMemo(() => [], []);

  useEffect(() => { setIsLoading(false); }, []);

  const handleDataChange = useCallback((notification) => {
    if (toast.current) toast.current.show(notification);
  }, []);

  const handleError = useCallback((notification) => {
    if (toast.current) toast.current.show(notification);
  }, []);

  const formatFieldName = (key) => startCase(key.split('__').join(' ').split('_').join(' '));

  const handleCellEditComplete = (e) => {
    const { rowData, newValue, field, oldValue } = e;
    toast.current.show({
      severity: 'success',
      summary: 'Cell Updated',
      detail: `Column: ${formatFieldName(field)} | Row: ${JSON.stringify(rowData).substring(0, 50)}... | Previous: ${oldValue} → Current: ${newValue}`,
      life: 5000
    });
  };

  const applyConfig = useCallback((config) => {
    if (!config) return;
    setConfigState(config);
    setConfigApplyKey((k) => k + 1);
  }, []);

  const handleDataSourceChange = useCallback((value) => {
    setConfigState(prev => ({ ...prev, dataSource: value, selectedQueryKey: null }));
    setSelectedPresetKey('');
    setPresetJsValue('');
    setConfigApplyKey((k) => k + 1);
  }, []);

  // Fetch config list on mount
  useEffect(() => {
    let cancelled = false;
    setConfigLoading(true);
    listConfigs()
      .then((list) => {
        if (!cancelled) setConfigList(list);
      })
      .finally(() => {
        if (!cancelled) setConfigLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Load Firebase presets when data source changes
  const loadPresetsForDataSource = useCallback(async (queryId) => {
    if (!queryId) { setFirebasePresets({}); return; }
    try {
      const presetsArray = await firestoreService.loadPresetsForQuery(queryId);
      const map = {};
      for (const p of presetsArray) {
        if (p?.name) map[p.name] = p.config ?? '';
      }
      setFirebasePresets(map);
    } catch (err) {
      console.error('Failed to load presets:', err);
      setFirebasePresets({});
    }
  }, []);

  useEffect(() => {
    loadPresetsForDataSource(dataSource);
  }, [dataSource, loadPresetsForDataSource]);

  const presetDropdownOptions = useMemo(() => {
    if (!dataSource) return [];
    const localItems = configList
      .filter((c) => getLocalConfig(c.id)?.dataSource === dataSource)
      .map((c) => ({ label: c.displayName, value: 'local:' + c.id, source: 'local' }));
    const fbItems = Object.keys(firebasePresets).map((name) => ({
      label: name, value: 'firebase:' + name, source: 'firebase',
    }));
    const groups = [];
    if (localItems.length > 0) groups.push({ label: 'Local', items: localItems });
    if (fbItems.length > 0) groups.push({ label: 'Firebase', items: fbItems });
    return groups;
  }, [dataSource, configList, firebasePresets]);

  const isConfigDirty = checkConfigDirty(presetJsValue, configState);

  useEffect(() => {
    if (!selectedPresetKey?.startsWith('firebase:') || !dataSource) return;
    const presetName = selectedPresetKey.slice('firebase:'.length);
    let cancelled = false;
    resolveFirebaseConfig(dataSource, presetName)
      .then((config) => {
        if (!cancelled) applyConfig(config ?? {});
      })
      .catch(() => {
        if (!cancelled) applyConfig({});
      });
    return () => { cancelled = true; };
  }, [selectedPresetKey, dataSource, applyConfig]);

  const handlePresetSelect = useCallback((key) => {
    setSelectedPresetKey(key);
    if (!key) { setPresetJsValue(''); return; }
    const [source, ...rest] = key.split(':');
    const id = rest.join(':');
    if (source === 'local') {
      const config = getLocalConfig(id);
      if (config) {
        setPresetJsValue(configSerialized[id] ?? serializeConfigToJs(config));
        applyConfig(config);
      }
    } else if (source === 'firebase') {
      const stored = firebasePresets[id];
      if (stored) {
        setPresetJsValue(stored);
      }
    }
  }, [firebasePresets]);

  useEffect(() => {
    if (selectedPresetKey && !presetJsValue) handlePresetSelect(selectedPresetKey);
  }, [selectedPresetKey, presetJsValue, handlePresetSelect]);

  const handleCreateNewPreset = useCallback(async () => {
    if (!dataSource) {
      toast.current?.show({ severity: 'warn', summary: 'No Data Source', detail: 'Select a data source first.', life: 3000 });
      return;
    }
    const name = window.prompt('Enter a name for the new preset:');
    if (!name?.trim()) return;
    let config = getLocalConfig(getDefaultConfigId()) ?? getDefaultConfig() ?? {};
    config = { ...config, dataSource };
    const presetJs = serializeConfigToJs(config);
    const saveName = name.trim();
    try {
      await firestoreService.savePresetForQuery(dataSource, saveName, presetJs);
      setPresetJsValue(presetJs);
      setFirebasePresets((prev) => ({ ...prev, [saveName]: presetJs }));
      setSelectedPresetKey('firebase:' + saveName);
      toast.current?.show({ severity: 'success', summary: 'Created', detail: `Preset "${saveName}" created`, life: 3000 });
    } catch (err) {
      console.error('Failed to create preset:', err);
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Failed to create preset', life: 3000 });
    }
  }, [dataSource]);

  const handleDeletePreset = useCallback((presetName) => {
    if (!dataSource) return;
    confirmDialog({
      message: `Delete Firebase preset "${presetName}"? This cannot be undone.`,
      header: 'Delete Preset',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        try {
          await firestoreService.deletePresetForQuery(dataSource, presetName);
          setFirebasePresets((prev) => { const next = { ...prev }; delete next[presetName]; return next; });
          if (selectedPresetKey === 'firebase:' + presetName) {
            setSelectedPresetKey('');
            setPresetJsValue('');
          }
          toast.current?.show({ severity: 'success', summary: 'Deleted', detail: `Preset "${presetName}" deleted`, life: 3000 });
        } catch (err) {
          console.error('Failed to delete preset:', err);
          toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Failed to delete preset', life: 3000 });
        }
      },
    });
  }, [dataSource, selectedPresetKey]);

  const doSavePreset = useCallback(async (saveName, value) => {
    if (!dataSource) {
      toast.current?.show({ severity: 'warn', summary: 'No Data Source', detail: 'Select a data source before saving.', life: 3000 });
      return;
    }
    let valueToSave = value;
    try {
      const config = deserializeJsToConfig(value);
      valueToSave = serializeConfigToJs({ ...config, dataSource });
    } catch { /* keep original */ }
    setPresetSaving(true);
    try {
      await firestoreService.savePresetForQuery(dataSource, saveName, valueToSave);
      setFirebasePresets((prev) => ({ ...prev, [saveName]: valueToSave }));
      setSelectedPresetKey('firebase:' + saveName);
      toast.current?.show({ severity: 'success', summary: 'Saved', detail: `Preset "${saveName}" saved`, life: 3000 });
    } catch (err) {
      console.error('Failed to save preset:', err);
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Failed to save preset', life: 3000 });
    } finally {
      setPresetSaving(false);
    }
  }, [dataSource]);

  const handleSavePreset = useCallback(() => {
    if (!selectedPresetKey || !presetJsValue) return;
    const [source, ...rest] = selectedPresetKey.split(':');
    const saveName = rest.join(':');
    if (source === 'local') {
      const localEntry = configList.find(c => c.id === saveName);
      saveLocalAsFirebaseContextRef.current = { presetJsValue };
      setSaveLocalAsFirebaseName((localEntry?.displayName || saveName) + ' (copy)');
      setSaveLocalAsFirebaseDialogVisible(true);
      return;
    }
    doSavePreset(saveName, presetJsValue);
  }, [selectedPresetKey, presetJsValue, configList, doSavePreset]);

  const handleSaveLocalAsFirebaseConfirm = useCallback(async () => {
    const name = saveLocalAsFirebaseName?.trim();
    if (!name) return;
    const ctx = saveLocalAsFirebaseContextRef.current;
    if (!ctx) return;
    setSaveLocalAsFirebaseDialogVisible(false);
    saveLocalAsFirebaseContextRef.current = null;
    await doSavePreset(name, ctx.presetJsValue);
  }, [saveLocalAsFirebaseName, doSavePreset]);

  const handleApplyPreset = useCallback((valueFromEditor) => {
    const toUse = (valueFromEditor && valueFromEditor.trim()) ? valueFromEditor : presetJsValue;
    if (!toUse) return;
    try {
      applyConfig(deserializeJsToConfig(toUse));
      toast.current?.show({ severity: 'success', summary: 'Applied', detail: 'Preset config applied', life: 2000 });
    } catch (err) {
      console.error('Failed to apply preset:', err);
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Invalid config: ' + err.message, life: 4000 });
    }
  }, [presetJsValue, applyConfig]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Toast ref={toast} />
      <Dialog
        header="Save preset"
        visible={saveLocalAsFirebaseDialogVisible}
        onHide={() => setSaveLocalAsFirebaseDialogVisible(false)}
        style={{ width: '24rem' }}
        footer={
          <div className="flex gap-2 justify-end">
            <Button label="Cancel" severity="secondary" onClick={() => setSaveLocalAsFirebaseDialogVisible(false)} />
            <Button label="Save" icon="pi pi-save" onClick={handleSaveLocalAsFirebaseConfirm} disabled={!saveLocalAsFirebaseName?.trim()} />
          </div>
        }
      >
        <p className="text-sm text-gray-600 mb-3">Local presets cannot be overwritten. Create a new Firebase preset based on it?</p>
        <label className="font-medium text-sm mb-1">Preset name</label>
        <InputText value={saveLocalAsFirebaseName} onChange={(e) => setSaveLocalAsFirebaseName(e.target.value)} placeholder="Enter preset name" className="w-full" />
      </Dialog>
      <main className="flex-1 flex flex-col min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center min-h-[calc(100vh-180px)]">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-blue-600 mb-3"></div>
              <p className="text-sm text-gray-500">Loading...</p>
            </div>
          </div>
        ) : (
          <DataProvider
            key={configApplyKey}
            config={configState}
            offlineData={offlineData}
            onDataChange={handleDataChange}
            onError={handleError}
          >
            {isDebugTableContext ? (
              <div className="flex-1 min-h-0 flex flex-col overflow-auto">
                <div className="shrink-0 p-3 sm:p-4 md:p-6 pb-0">
                  <DebugDataContext hideTable={hideTableInDebug} onHideTableChange={setHideTableInDebug} />
                </div>
                {!hideTableInDebug && (
                  <div className="flex-1 min-h-0 flex flex-col min-w-0 p-3 sm:p-4 md:p-6">
                    <DataTablePageContent onCellEditComplete={handleCellEditComplete} config={configState} />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col">
                <Splitter style={{ height: '100%' }} layout="horizontal" className="h-full flex-1 min-h-0">
                  <SplitterPanel className="flex flex-col min-w-0 h-full" size={80} minSize={30}>
                    <div className="flex flex-col min-w-0 h-full p-3 sm:p-4 md:p-6">
                      <DataTablePageContent onCellEditComplete={handleCellEditComplete} config={configState} />
                    </div>
                  </SplitterPanel>
                  <SplitterPanel className="flex flex-col min-w-0 overflow-hidden border-l border-gray-200" size={20} minSize={2}>
                    <DataTableControls
                      config={configState}
                      dataSource={dataSource}
                      onDataSourceChange={handleDataSourceChange}
                      presetDropdownOptions={presetDropdownOptions}
                      selectedPresetKey={selectedPresetKey}
                      onPresetSelect={handlePresetSelect}
                      presetJsValue={presetJsValue}
                      onPresetJsChange={setPresetJsValue}
                      onSavePreset={handleSavePreset}
                      onApplyPreset={handleApplyPreset}
                      onCreateNewPreset={handleCreateNewPreset}
                      onDeletePreset={handleDeletePreset}
                      presetSaving={presetSaving}
                      isConfigDirty={isConfigDirty}
                    />
                  </SplitterPanel>
                </Splitter>
              </div>
            )}
          </DataProvider>
        )}
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <ProtectedRoute>
      <DataTablePage />
    </ProtectedRoute>
  );
}
