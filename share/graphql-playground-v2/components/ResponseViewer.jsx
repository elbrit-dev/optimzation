'use client';

import Editor from '@monaco-editor/react';
import { usePlaygroundStore } from '../stores/usePlaygroundStore';

export function ResponseViewer() {
  const { response } = usePlaygroundStore();

  return (
    <div className="h-full w-full overflow-hidden">
      <Editor
        height="100%"
        language="json"
        value={response}
        theme="vs-light"
        options={{
          readOnly: true,
          automaticLayout: true,
          wordWrap: 'on',
          minimap: { enabled: false },
          folding: true,
          lineNumbers: 'off',
          glyphMargin: false,
        }}
      />
    </div>
  );
}
