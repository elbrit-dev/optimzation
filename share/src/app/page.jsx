'use client';

import Link from 'next/link';
import { useState, useCallback, useRef } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { firestoreService } from '@/app/graphql-playground/services/firestoreService';
import { GQL_COLLECTIONS } from '@/app/graphql-playground/constants';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { Toast } from 'primereact/toast';

function Home() {
  const [downloadDialogVisible, setDownloadDialogVisible] = useState(false);
  const [uploadDialogVisible, setUploadDialogVisible] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState(GQL_COLLECTIONS[0] || 'gql');
  const [customDownloadCollection, setCustomDownloadCollection] = useState('');
  const [uploadCollection, setUploadCollection] = useState(GQL_COLLECTIONS[0] || 'gql');
  const [customUploadCollection, setCustomUploadCollection] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef(null);
  const toastRef = useRef(null);

  const collectionOptions = [
    ...GQL_COLLECTIONS.map((c) => ({ label: c, value: c })),
    { label: 'Custom...', value: '__custom__' },
  ];

  const handleDownload = useCallback(async () => {
    const coll = selectedCollection === '__custom__' ? customDownloadCollection.trim() : selectedCollection;
    if (!coll) {
      toastRef.current?.show({ severity: 'warn', summary: 'Collection required', detail: 'Enter a collection name' });
      return;
    }
    setIsExporting(true);
    try {
      const data = await firestoreService.exportCollectionAsJson(coll);
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      a.download = `gql-export-${coll}-${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadDialogVisible(false);
      toastRef.current?.show({ severity: 'success', summary: 'Downloaded', detail: `Exported ${Object.keys(data.documents).length} documents from ${coll}` });
    } catch (error) {
      console.error('Export failed:', error);
      toastRef.current?.show({ severity: 'error', summary: 'Export failed', detail: error?.message });
    } finally {
      setIsExporting(false);
    }
  }, [selectedCollection, customDownloadCollection]);

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const coll = uploadCollection === '__custom__' ? customUploadCollection.trim() : uploadCollection;
    if (!coll) {
      toastRef.current?.show({ severity: 'warn', summary: 'Collection required', detail: 'Enter a collection name' });
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result);
        if (!data?.documents) {
          throw new Error('Invalid format: expected { collection, documents }');
        }
        setIsImporting(true);
        const { imported } = await firestoreService.importCollectionFromJson(coll, data);
        setUploadDialogVisible(false);
        setUploadCollection(GQL_COLLECTIONS[0] || 'gql');
        setCustomUploadCollection('');
        fileInputRef.current.value = '';
        toastRef.current?.show({ severity: 'success', summary: 'Imported', detail: `Imported ${imported} documents into ${coll}` });
      } catch (err) {
        console.error('Import failed:', err);
        toastRef.current?.show({ severity: 'error', summary: 'Import failed', detail: err?.message });
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  }, [uploadCollection, customUploadCollection]);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <Link
            href="/datatable"
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200 group"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                  Data Table
                </h2>
                <p className="text-sm text-gray-600">
                  View, filter, sort, and analyze your data with advanced table controls
                </p>
              </div>
              <div className="ml-4 text-gray-400 group-hover:text-blue-600 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>
          </Link>

          <Link
            href="/navigation"
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200 group"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                  Navigation
                </h2>
                <p className="text-sm text-gray-600">
                  Navigate through the application and explore different sections
                </p>
              </div>
              <div className="ml-4 text-gray-400 group-hover:text-blue-600 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </div>
            </div>
          </Link>

          <Link
            href="/graphql-playground-v2"
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200 group"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                  GraphQL Playground
                </h2>
                <p className="text-sm text-gray-600">
                  Modern GraphQL playground with Monaco Editor and query management
                </p>
              </div>
              <div className="ml-4 text-gray-400 group-hover:text-blue-600 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => setDownloadDialogVisible(true)}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200 group text-left w-full"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                  Download GQL Collection
                </h2>
                <p className="text-sm text-gray-600">
                  Export a GQL collection as JSON
                </p>
              </div>
              <div className="ml-4 text-gray-400 group-hover:text-blue-600 transition-colors">
                <i className="pi pi-download text-2xl" />
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setUploadDialogVisible(true)}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200 group text-left w-full"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                  Upload GQL Collection
                </h2>
                <p className="text-sm text-gray-600">
                  Import JSON into a GQL collection
                </p>
              </div>
              <div className="ml-4 text-gray-400 group-hover:text-blue-600 transition-colors">
                <i className="pi pi-upload text-2xl" />
              </div>
            </div>
          </button>
        </div>

        <Dialog
          header="Download Collection"
          visible={downloadDialogVisible}
          onHide={() => setDownloadDialogVisible(false)}
          style={{ width: '24rem' }}
          footer={
            <div className="flex gap-2 justify-end">
              <Button label="Cancel" severity="secondary" onClick={() => setDownloadDialogVisible(false)} />
              <Button label="Download" icon="pi pi-download" loading={isExporting} onClick={handleDownload} />
            </div>
          }
        >
          <div className="flex flex-col gap-3">
            <label className="font-medium">Collection</label>
            <Dropdown
              value={selectedCollection}
              options={collectionOptions}
              onChange={(e) => setSelectedCollection(e.value)}
              placeholder="Select collection"
              className="w-full"
            />
            {selectedCollection === '__custom__' && (
              <InputText
                value={customDownloadCollection}
                onChange={(e) => setCustomDownloadCollection(e.target.value)}
                placeholder="Collection name"
                className="w-full"
              />
            )}
          </div>
        </Dialog>

        <Dialog
          header="Upload Collection"
          visible={uploadDialogVisible}
          onHide={() => setUploadDialogVisible(false)}
          style={{ width: '24rem' }}
          footer={
            <div className="flex gap-2 justify-end">
              <Button label="Cancel" severity="secondary" onClick={() => setUploadDialogVisible(false)} />
              <Button
                label="Choose File"
                icon="pi pi-file"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
              />
            </div>
          }
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="flex flex-col gap-3">
            <label className="font-medium">Target collection</label>
            <Dropdown
              value={uploadCollection}
              options={collectionOptions}
              onChange={(e) => setUploadCollection(e.value)}
              placeholder="Select collection"
              className="w-full"
            />
            {uploadCollection === '__custom__' && (
              <InputText
                value={customUploadCollection}
                onChange={(e) => setCustomUploadCollection(e.target.value)}
                placeholder="Collection name"
                className="w-full"
              />
            )}
            <p className="text-sm text-gray-500">
              Select a JSON file with format: {"{ collection, documents }"}
            </p>
          </div>
        </Dialog>

        <Toast ref={toastRef} />
      </main>
    </div>
  );
}

export default function HomePage() {
  return (
    <ProtectedRoute>
      <Home />
    </ProtectedRoute>
  );
}

