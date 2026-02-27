'use client';

import { useDebounce } from '@/hooks/useDebounce';
import Editor from '@monaco-editor/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlaygroundStore } from '../stores/usePlaygroundStore';

export function QueryEditor({ onQueryChange }) {
  const query = usePlaygroundStore((state) => state.query);
  const setQuery = usePlaygroundStore((state) => state.setQuery);
  const flushQueryRequested = usePlaygroundStore((state) => state.flushQueryRequested);
  const markDirty = usePlaygroundStore((state) => state.markDirty);

  // Local state for immediate UI updates
  const [localQuery, setLocalQuery] = useState(query);
  const lastSentValueRef = useRef(query);
  const editorRef = useRef(null);
  const localQueryRef = useRef(localQuery);
  localQueryRef.current = localQuery;

  // Debounce store updates (300ms delay)
  const debouncedSetQuery = useDebounce((value) => {
    lastSentValueRef.current = value;
    setQuery(value);
  }, 300);

  // On-demand flush: when Execute or tab switch requests it, push local to store immediately
  useEffect(() => {
    if (!flushQueryRequested) return;
    const latest = localQueryRef.current;
    setQuery(latest);
    lastSentValueRef.current = latest;
    debouncedSetQuery.cancel?.();
  }, [flushQueryRequested, setQuery, debouncedSetQuery]);

  // Sync store value to local state when changed externally
  useEffect(() => {
    if (query === lastSentValueRef.current) return;
    setLocalQuery(query);
    lastSentValueRef.current = query;
  }, [query]);

  // Handle editor changes
  const handleChange = useCallback((value) => {
    const newValue = value || '';
    setLocalQuery(newValue);
    debouncedSetQuery(newValue);
    markDirty();
    if (onQueryChange) onQueryChange(newValue);
  }, [debouncedSetQuery, markDirty, onQueryChange]);

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
    <div className="h-full w-full overflow-hidden">
      <Editor
        height="100%"
        language="graphql"
        value={localQuery}
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
