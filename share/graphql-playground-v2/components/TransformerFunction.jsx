'use client';

import { useDebounce } from '@/hooks/useDebounce';
import Editor from '@monaco-editor/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlaygroundStore } from '../stores/usePlaygroundStore';

export function TransformerFunction() {
  const transformerFunction = usePlaygroundStore(
    (state) => state.transformerFunction
  );
  const setTransformerFunction = usePlaygroundStore(
    (state) => state.setTransformerFunction
  );

  // Local state for immediate UI updates
  const [localTransformerFunction, setLocalTransformerFunction] = useState(transformerFunction);
  const markDirty = usePlaygroundStore((state) => state.markDirty);
  const lastSentValueRef = useRef(transformerFunction);
  const editorRef = useRef(null);

  // Debounce store updates (300ms delay)
  const debouncedSetTransformerFunction = useDebounce((value) => {
    lastSentValueRef.current = value;
    setTransformerFunction(value);
  }, 300);

  // Sync store value to local state when changed externally
  // Only sync if the store value is different from what we last sent
  // This prevents flicker when our debounced update finally fires
  useEffect(() => {
    // If the store value matches what we last sent, it's from our debounced update - ignore it
    if (transformerFunction === lastSentValueRef.current) {
      return;
    }
    // Otherwise, it's an external update - sync it
    setLocalTransformerFunction(transformerFunction);
    lastSentValueRef.current = transformerFunction;
  }, [transformerFunction]);

  // Handle editor changes
  const handleChange = useCallback((value) => {
    const newValue = value || '';
    setLocalTransformerFunction(newValue);
    debouncedSetTransformerFunction(newValue);
    markDirty();
  }, [debouncedSetTransformerFunction, markDirty]);

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
    <div className="h-full w-full min-h-0 overflow-hidden flex flex-col">
      <div className="flex-shrink-0 px-3 py-1.5 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">Transformer</h3>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <Editor
          height="100%"
          language="javascript"
          value={localTransformerFunction}
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
    </div>
  );
}
