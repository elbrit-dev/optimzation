'use client';

import Editor from '@monaco-editor/react';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { useCallback, useEffect, useRef, useState } from 'react';
import { firestoreService } from '@/app/graphql-playground/services/firestoreService';

export function GlobalFunctions() {
  const [functionsCode, setFunctionsCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasError, setHasError] = useState(false);
  const toast = useRef(null);

  // Load global functions on mount
  useEffect(() => {
    const loadFunctions = async () => {
      setIsLoading(true);
      setHasError(false);
      try {
        const functions = await firestoreService.loadGlobalFunctions();
        setFunctionsCode(functions || '');
      } catch (error) {
        console.error('Failed to load global functions:', error);
        setHasError(true);
        if (toast.current) {
          toast.current.show({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to load global functions',
            life: 3000
          });
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadFunctions();
  }, []);

  // Handle save button click
  const handleSave = useCallback(async () => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    setHasError(false);

    try {
      await firestoreService.saveGlobalFunctions(functionsCode);
      if (toast.current) {
        toast.current.show({
          severity: 'success',
          summary: 'Success',
          detail: 'Global functions saved successfully',
          life: 3000
        });
      }
    } catch (error) {
      console.error('Failed to save global functions:', error);
      setHasError(true);
      if (toast.current) {
        toast.current.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to save global functions',
          life: 3000
        });
      }
    } finally {
      setIsSaving(false);
    }
  }, [functionsCode, isSaving]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50">
      <Toast ref={toast} />
      <div className="flex-shrink-0 px-3 py-1.5 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Global Functions</h3>
          <Button
            icon={isSaving ? "pi pi-spin pi-spinner" : "pi pi-save"}
            label="Save"
            className={`p-button-sm ${
              isSaving
                ? "p-button-secondary"
                : hasError
                  ? "p-button-danger"
                  : "p-button-primary"
            }`}
            onClick={handleSave}
            title={
              isSaving
                ? "Saving..."
                : hasError
                  ? "Previous save had an error - Click to save again"
                  : "Save global functions"
            }
            loading={isSaving}
            disabled={isLoading}
          />
        </div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden p-2" style={{ minHeight: 0 }}>
        {/* Monaco Editor */}
        <div className="flex-1 border border-gray-300 rounded-lg overflow-hidden" style={{ minHeight: 0, height: '100%' }}>
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <i className="pi pi-spin pi-spinner text-xl text-gray-400 mb-1.5"></i>
                <p className="text-sm text-gray-500">Loading global functions...</p>
              </div>
            </div>
          ) : (
            <Editor
              height="100%"
              language="javascript"
              value={functionsCode}
              onChange={(value) => setFunctionsCode(value || '')}
              theme="vs-light"
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                scrollBeyondLastLine: false,
                wordWrap: 'on',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
