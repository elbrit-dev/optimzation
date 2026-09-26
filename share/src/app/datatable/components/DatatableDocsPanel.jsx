'use client';

import {
  CONFIG_DOCS_BY_KEY,
  CONTEXT_DOC_SECTIONS,
  DOCS_CONFIG_KEY_ORDER,
  getConfigDocTitle,
} from '../data/datatablePlaygroundDocsData';

function CodeBlock({ children }) {
  if (!children?.trim()) return null;
  return (
    <pre className="mt-1.5 text-xs font-mono bg-sunken text-body rounded p-2 overflow-x-auto whitespace-pre-wrap break-words border border-line-subtle">
      <code>{children.trim()}</code>
    </pre>
  );
}

export default function DatatableDocsPanel() {
  const sortedContextSections = [...CONTEXT_DOC_SECTIONS].sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col h-full min-h-0 text-body">
      <div className="shrink-0 px-3 py-2 border-b border-line-subtle bg-sunken/80">
        <h2 className="text-sm font-semibold text-body">Docs</h2>
        <p className="text-xs text-ds-secondary mt-0.5 leading-snug">
          Consumer reference for config and <code className="text-11 bg-surface-disabled/80 px-1 rounded">useTableOperations</code>.
          See USAGE.md for full detail.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-4 max-h-[calc(100vh-320px)]">
        <section className="rounded-lg border border-line-subtle bg-surface p-3 shadow-card">
          <h3 className="text-xs font-bold uppercase tracking-wide text-ds-secondary mb-2">Flow</h3>
          <pre className="text-11 font-mono text-body bg-sunken rounded p-2 border border-line-subtle whitespace-pre-wrap">
            {`DataProvider
  └─ TableOperationsContext
       └─ useTableOperations(slotId?)
            └─ your components / DataTableNew`}
          </pre>
        </section>

        <section className="rounded-lg border border-line-subtle bg-surface p-3 shadow-card">
          <h3 className="text-xs font-bold uppercase tracking-wide text-ds-secondary mb-2">Quick start</h3>
          <CodeBlock>{`import DataProvider from '@/app/datatable/components/DataProvider';
import DataTableNew from '@/app/datatable/components/DataTableNew';

<DataProvider __internal={{ config }} offlineData={rows}>
  <DataTableNew tableName="main" />
</DataProvider>`}</CodeBlock>
        </section>

        <section className="rounded-lg border border-line-subtle bg-surface p-3 shadow-card">
          <h3 className="text-xs font-bold uppercase tracking-wide text-ds-secondary mb-3">Config options</h3>
          <p className="text-xs text-ds-secondary mb-3 leading-relaxed">
            Order matches the readable config view, with <strong className="font-medium text-body">slots</strong> after query selection.
          </p>
          <div className="space-y-2">
            {DOCS_CONFIG_KEY_ORDER.map((key) => {
              const doc = CONFIG_DOCS_BY_KEY[key];
              if (!doc) return null;
              return (
                <details
                  key={key}
                  className="group border border-line-subtle rounded-md bg-sunken/50 open:bg-surface open:shadow-card"
                >
                  <summary className="cursor-pointer select-none px-2 py-2 text-xs font-semibold text-body list-none flex items-center gap-1.5 [&::-webkit-details-marker]:hidden">
                    <i className="pi pi-chevron-right text-10 text-ds-muted group-open:rotate-90 transition-transform shrink-0" />
                    <span className="font-mono text-11 text-brand-active shrink-0">{key}</span>
                    <span className="text-ds-secondary font-normal truncate">{getConfigDocTitle(key)}</span>
                  </summary>
                  <div className="px-2 pb-2 pt-0 border-t border-line-subtle">
                    <p className="text-xs text-ds-secondary leading-relaxed mt-2">{doc.body}</p>
                    <CodeBlock>{doc.example}</CodeBlock>
                  </div>
                </details>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-line-subtle bg-surface p-3 shadow-card">
          <h3 className="text-xs font-bold uppercase tracking-wide text-ds-secondary mb-3">
            Table context (<code className="text-11">useTableOperations</code>)
          </h3>
          <div className="space-y-4">
            {sortedContextSections.map((section) => (
              <div key={section.id} className="border-b border-line-subtle last:border-0 pb-3 last:pb-0">
                <h4 className="text-xs font-semibold text-body mb-2">{section.title}</h4>
                <div className="space-y-2">
                  {section.blocks.map((block) => (
                    <details
                      key={block.title}
                      className="group border border-line-subtle rounded-md bg-sunken/30 open:bg-sunken"
                    >
                      <summary className="cursor-pointer select-none px-2 py-1.5 text-xs font-medium text-body list-none flex items-center gap-1.5 [&::-webkit-details-marker]:hidden">
                        <i className="pi pi-chevron-right text-10 text-ds-muted group-open:rotate-90 transition-transform shrink-0" />
                        {block.title}
                      </summary>
                      <div className="px-2 pb-2">
                        <p className="text-xs text-ds-secondary leading-relaxed mt-1">{block.body}</p>
                        <CodeBlock>{block.example}</CodeBlock>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
