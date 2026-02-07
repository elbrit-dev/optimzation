'use client';

import { useDebounce } from '@/hooks/useDebounce';
import Editor from '@monaco-editor/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlaygroundStore } from '../stores/usePlaygroundStore';

export function QueryEditor({ onQueryChange }) {
  const query = usePlaygroundStore((state) => state.query);
  const setQuery = usePlaygroundStore((state) => state.setQuery);
  const markDirty = usePlaygroundStore((state) => state.markDirty);

  // Local state for immediate UI updates
  const [localQuery, setLocalQuery] = useState(query);
  const lastSentValueRef = useRef(query);
  const editorRef = useRef(null);

  // Debounce store updates (300ms delay)
  const debouncedSetQuery = useDebounce((value) => {
    lastSentValueRef.current = value;
    setQuery(value);
  }, 300);

  // Sync store value to local state when changed externally
  // Only sync if the store value is different from what we last sent
  // This prevents flicker when our debounced update finally fires
  useEffect(() => {
    // If the store value matches what we last sent, it's from our debounced update - ignore it
    if (query === lastSentValueRef.current) {
      return;
    }
    // Otherwise, it's an external update (e.g., from GraphQLExplorer) - sync it
    setLocalQuery(query);
    lastSentValueRef.current = query;
  }, [query]);

  // Handle editor changes
  const handleChange = useCallback((value) => {
    const newValue = value || '';
    setLocalQuery(newValue);
    debouncedSetQuery(newValue);
    markDirty();
    // Notify parent component of immediate changes for real-time updates
    if (onQueryChange) {
      onQueryChange(newValue);
    }
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
