'use client';

import Editor from '@monaco-editor/react';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlaygroundStore } from '../stores/usePlaygroundStore';

const LEVEL_ICONS = {
  log: 'pi pi-info-circle',
  warn: 'pi pi-exclamation-triangle',
  error: 'pi pi-times-circle',
};

const LEVEL_STYLES = {
  log: 'text-gray-600',
  warn: 'text-amber-600',
  error: 'text-red-600',
};

/** Replace leading { with {Object} and [ with [Array] for accordion header display */
function accordionPreviewLabel(preview) {
  if (!preview || typeof preview !== 'string') return preview;
  if (preview.startsWith('{')) return '{Object}' + preview.slice(1);
  if (preview.startsWith('[')) return '[Array]' + preview.slice(1);
  return preview;
}

function getEditorLanguage(content) {
  if (!content || !content.trim()) return 'plaintext';
  const trimmed = content.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return 'json';
  }
  return 'plaintext';
}

const LINE_HEIGHT = 19;
const MIN_EDITOR_HEIGHT = 60;
const MAX_EDITOR_HEIGHT = 600;

function LogEntryEditor({ content, language }) {
  const editorRef = useRef(null);
  const lineCount = (content || '').split('\n').length;
  const editorHeight = Math.min(
    Math.max(lineCount * LINE_HEIGHT, MIN_EDITOR_HEIGHT),
    MAX_EDITOR_HEIGHT
  );

  const handleEditorDidMount = useCallback((editor) => {
    editorRef.current = editor;
    editor.layout();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (editorRef.current) {
        editorRef.current.layout();
      }
    };

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
    <div className="w-full overflow-hidden" style={{ height: editorHeight }}>
      <Editor
        height={editorHeight}
        language={language}
        value={content || ''}
        onMount={handleEditorDidMount}
        theme="vs-light"
        options={{
          readOnly: true,
          wordWrap: 'on',
          minimap: { enabled: false },
          renderLineHighlight: 'gutter',
          scrollBeyondLastLine: false,
        }}
      />
    </div>
  );
}

export function TransformerConsoleViewer() {
  const transformerLogs = usePlaygroundStore((state) => state.transformerLogs);
  const [expandedIndices, setExpandedIndices] = useState([]);
  const scrollContainerRef = useRef(null);

  const handleTabChange = (e) => {
    setExpandedIndices(e.index ?? []);
  };

  useEffect(() => {
    if (transformerLogs?.length && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [transformerLogs?.length]);

  if (!transformerLogs || transformerLogs.length === 0) {
    return (
      <>
        <div className="px-3 py-1.5 border-b border-gray-200 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-700">Transformer Console</h3>
        </div>
        <div className="flex-1 overflow-hidden p-2 flex flex-col items-center justify-center text-gray-500">
          <i className="pi pi-terminal text-3xl mb-2"></i>
          <p className="text-sm">No transformer output yet</p>
          <p className="text-xs mt-1">Run a query with transformer code to see logs, errors, and JSON output here.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="px-3 py-1.5 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">Transformer Console</h3>
      </div>
      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-auto p-2">
        <Accordion
          multiple
          activeIndex={expandedIndices}
          onTabChange={handleTabChange}
          className="border-0 bg-transparent"
        >
          {transformerLogs.map((entry) => {
            const levelStyle = LEVEL_STYLES[entry.level] || LEVEL_STYLES.log;
            const icon = LEVEL_ICONS[entry.level] || LEVEL_ICONS.log;
            const header = (
              <div className="flex items-center gap-2 min-w-0">
                <i className={`pi shrink-0 ${icon} ${levelStyle} text-xs`}></i>
                <span className="truncate text-xs font-mono text-gray-700" title={entry.preview}>
                  {accordionPreviewLabel(entry.preview) || '(empty)'}
                </span>
              </div>
            );
            const language = getEditorLanguage(entry.content);
            return (
              <AccordionTab key={entry.id} header={header} className="border-b border-gray-200">
                <LogEntryEditor content={entry.content} language={language} />
              </AccordionTab>
            );
          })}
        </Accordion>
      </div>
    </>
  );
}
