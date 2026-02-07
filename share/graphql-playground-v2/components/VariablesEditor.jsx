'use client';

import { useDebounce } from '@/hooks/useDebounce';
import Editor from '@monaco-editor/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlaygroundStore } from '../stores/usePlaygroundStore';

export function VariablesEditor() {
  const variables = usePlaygroundStore((state) => state.variables);
  const setVariables = usePlaygroundStore((state) => state.setVariables);
  const markDirty = usePlaygroundStore((state) => state.markDirty);

  // Local state for immediate UI updates
  const [localVariables, setLocalVariables] = useState(variables);
  const lastSentValueRef = useRef(variables);
  const editorRef = useRef(null);

  // Debounce store updates (300ms delay)
  const debouncedSetVariables = useDebounce((value) => {
    lastSentValueRef.current = value;
    setVariables(value);
  }, 300);

  // Sync store value to local state when changed externally
  // Only sync if the store value is different from what we last sent
  // This prevents flicker when our debounced update finally fires
  useEffect(() => {
    // If the store value matches what we last sent, it's from our debounced update - ignore it
    if (variables === lastSentValueRef.current) {
      return;
    }
    // Otherwise, it's an external update - sync it
    setLocalVariables(variables);
    lastSentValueRef.current = variables;
  }, [variables]);

  // Handle editor changes
  const handleChange = useCallback((value) => {
    const newValue = value || '{}';
    setLocalVariables(newValue);
    debouncedSetVariables(newValue);
    markDirty();
  }, [debouncedSetVariables, markDirty]);

  // Handle editor mount
  const handleEditorDidMount = useCallback((editor) => {
    editorRef.current = editor;
    // Initial layout
    editor.layout();
  }, []);

  // Handle window resize for manual layout
  useEffect(() => {
    const handleResize = () => {
      if (editorRef.current) {
        editorRef.current.layout();
      }
    };

    // Debounce resize events
    let resizeTimeout;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(handleResize, 150);
    };

    window.addEventListener('resize', debouncedResize);
    return () => {
      window.removeEventListener('resize', debouncedResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  return (
    <div className="h-full w-full min-h-0 overflow-hidden">
      <Editor
        height="100%"
        language="json"
        value={localVariables}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        theme="vs-light"
        options={{
          wordWrap: 'on',
          minimap: { enabled: false },
          renderLineHighlight: 'gutter',
        }}
      />
    </div>
  );
}
