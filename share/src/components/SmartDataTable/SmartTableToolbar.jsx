'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/design-system';

// ─── Generic Toolbar ─────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   id: string,
 *   type: 'button',
 *   icon: string,
 *   title: string,
 *   onClick: () => void,
 *   disabled?: boolean,
 *   active?: boolean,
 *   color?: 'default' | 'green' | 'purple' | 'indigo' | 'red',
 * } | {
 *   id: string,
 *   type: 'custom',
 *   render: () => import('react').ReactNode,
 * }} ActionDef
 */

/* Toolbar buttons get exactly two fills: brand blue for anything interactive,
   and danger red for destructive intent. A categorical colour (violet, plum,
   cyan) must never be used as chrome — those exist to distinguish data series,
   and the old map used them for the fullscreen and group-by buttons.

   `action.color` is still accepted for compatibility, but only 'red' changes
   anything now; 'green', 'purple' and 'indigo' resolve to the default. */

function ActionItem({ action }) {
  if (action.type === 'custom') return action.render();

  const danger = (action.color ?? 'default') === 'red';

  return (
    <Button
      type={action.active || danger ? 'primary' : 'default'}
      danger={danger}
      disabled={action.disabled}
      onClick={action.onClick}
      title={action.title}
      icon={<i className={`pi ${action.icon}`} />}
    />
  );
}

/**
 * Generic dumb toolbar. Renders two groups of ActionDef items.
 * To add a new button, push an ActionDef into leftActions or rightActions — no changes needed here.
 *
 * @param {{ leftActions?: ActionDef[], rightActions?: ActionDef[], className?: string }} props
 */
export function SmartTableToolbar({ leftActions = [], rightActions = [], className = '' }) {
  if (leftActions.length === 0 && rightActions.length === 0) return null;

  return (
    <div className={`mb-4 flex items-center justify-between gap-4 flex-wrap ${className}`}>
      <div className="shrink-0 flex items-center gap-2">
        {leftActions.map(action => <ActionItem key={action.id} action={action} />)}
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {rightActions.map(action => <ActionItem key={action.id} action={action} />)}
      </div>
    </div>
  );
}

// ─── Group-By Reorder ─────────────────────────────────────────────────────────

/**
 * Pure UI widget. Receives the current group_by order as a string array and
 * calls onChange with the reordered array after a drag-and-drop swap.
 * Has no knowledge of viewId, viewParams, or the store.
 *
 * @param {{ groups: string[], onChange: (newGroups: string[]) => void }} props
 */
export function GroupByReorder({ groups, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => { setMounted(true); }, []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleDrop = (e, targetIdx) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); setOverIdx(null); return; }
    const next = [...groups];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(targetIdx, 0, moved);
    onChange(next);
    setDragIdx(null);
    setOverIdx(null);
  };

  const moveItem = (idx, direction) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= groups.length) return;
    const next = [...groups];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    onChange(next);
  };

  if (!groups.length) return null;

  const dropdownContent = isOpen && mounted ? (
    <div
      ref={dropdownRef}
      /* Test hook. The panel is portalled to <body> and has no semantic role,
         so the e2e page object previously matched it by a `.column-visibility-
         dropdown` class that never existed — every toolbar test timed out. A
         data-testid survives restyling; a utility-class selector does not. */
      data-testid="group-by-panel"
      className="fixed z-[9999] bg-surface border border-line-subtle rounded-lg shadow-pop overflow-hidden"
      style={{ top: `${position.top}px`, left: `${position.left}px`, minWidth: '200px', maxWidth: '320px' }}
    >
      <div className="px-3 py-2 border-b border-line-subtle text-10 font-medium text-ds-secondary uppercase tracking-wide">
        Group by order — drag to reorder
      </div>
      <div className="py-1">
        {groups.map((group, idx) => (
          <div
            key={group}
            draggable
            onDragStart={e => { setDragIdx(idx); e.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverIdx(idx); }}
            onDrop={e => handleDrop(e, idx)}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
            className={`flex items-center gap-2 px-3 py-2 cursor-grab select-none text-sm transition-colors
              ${dragIdx === idx ? 'opacity-40 bg-sunken' : ''}
              ${overIdx === idx && dragIdx !== idx ? 'bg-info-wash border-t-2 border-info-border' : 'hover:bg-brand-tint-weak'}
            `}
          >
            <i className="pi pi-bars text-ds-muted text-xs flex-none" />
            <span className="flex-1 truncate text-body">{group}</span>
            <span className="flex-none w-5 h-5 rounded-full bg-brand-tint text-brand text-10 font-bold flex items-center justify-center leading-none">
              {idx + 1}
            </span>
            <div className="flex-none flex flex-col">
              <button
                type="button"
                onClick={() => moveItem(idx, -1)}
                disabled={idx === 0}
                title="Move up"
                className="w-4 h-3.5 flex items-center justify-center text-ds-muted hover:text-brand disabled:opacity-30 disabled:hover:text-ds-muted leading-none"
              >
                <i className="pi pi-chevron-up text-10" />
              </button>
              <button
                type="button"
                onClick={() => moveItem(idx, 1)}
                disabled={idx === groups.length - 1}
                title="Move down"
                className="w-4 h-3.5 flex items-center justify-center text-ds-muted hover:text-brand disabled:opacity-30 disabled:hover:text-ds-muted leading-none"
              >
                <i className="pi pi-chevron-down text-10" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="px-3 py-2 bg-sunken border-t border-line-subtle text-xs text-ds-secondary">
        {groups.length} group{groups.length !== 1 ? 's' : ''} active
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setIsOpen(o => !o); updatePosition(); }}
        title={`Group by: ${groups.join(' → ')}`}
        className={`relative h-control aspect-square rounded-md border transition-colors flex items-center justify-center ${
          isOpen
            ? 'bg-brand border-transparent text-on-brand hover:bg-brand-hover'
            : 'bg-surface border-line-subtle text-body hover:border-brand-hover hover:text-brand-hover'
        }`}
      >
        <i className="pi pi-sort-alt text-base" />
        <span className="absolute -top-1 -right-1 bg-brand text-on-brand text-10 font-bold rounded-full w-5 h-5 flex items-center justify-center leading-none">
          {groups.length}
        </span>
      </button>
      {mounted && createPortal(dropdownContent, document.body)}
    </>
  );
}

// ─── Column Visibility Dropdown ───────────────────────────────────────────────

/**
 * Eye-icon button that opens a portal dropdown for toggling column visibility.
 *
 * @param {{
 *   columns: import('./dataSources').ColumnDef[],
 *   hiddenColumns: string[],
 *   onChange: (hiddenFields: string[]) => void,
 * }} props
 */
export function ColumnVisibilityDropdown({ columns, columnGroups, hiddenColumns, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 220 });
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => { setMounted(true); }, []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: Math.max(220, rect.width),
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const colByField = useMemo(() => Object.fromEntries(columns.map(c => [c.field, c])), [columns]);

  const filteredColumns = useMemo(() => {
    if (!searchTerm) return columns;
    const term = searchTerm.toLowerCase();
    return columns.filter(c => c.header.toLowerCase().includes(term));
  }, [columns, searchTerm]);

  // Build grouped sections: each group has a label + its filtered columns.
  // Ungrouped columns (not in any group) fall into a null-label section.
  const groupedSections = useMemo(() => {
    if (!columnGroups?.length) return null;
    const filteredSet = new Set(filteredColumns.map(c => c.field));
    const sections = columnGroups
      .map(g => ({
        id: g.id,
        label: g.label,
        cols: g.fields.map(f => colByField[f]).filter(c => c && filteredSet.has(c.field)),
      }))
      .filter(s => s.cols.length > 0);
    const groupedFields = new Set(columnGroups.flatMap(g => g.fields));
    const ungrouped = filteredColumns.filter(c => !groupedFields.has(c.field));
    if (ungrouped.length) sections.unshift({ id: '__ungrouped__', label: null, cols: ungrouped });
    return sections;
  }, [columnGroups, filteredColumns, colByField]);

  const hiddenSet = useMemo(() => new Set(hiddenColumns), [hiddenColumns]);
  const hiddenCount = hiddenColumns.length;

  const toggleColumn = (field) => {
    if (hiddenSet.has(field)) {
      onChange(hiddenColumns.filter(f => f !== field));
    } else {
      onChange([...hiddenColumns, field]);
    }
  };

  const showAll = () => onChange([]);
  const hideAll = () => onChange(columns.map(c => c.field));

  const dropdownContent = isOpen && mounted ? (
    <div
      ref={dropdownRef}
      data-testid="column-visibility-panel"
      className="fixed z-[9999] bg-surface border border-line-subtle rounded-lg shadow-pop overflow-hidden"
      style={{ top: `${position.top}px`, left: `${position.left}px`, minWidth: '200px', maxWidth: '360px' }}
    >
      <div className="p-2 border-b border-line-subtle">
        <div className="relative">
          <i className="pi pi-search absolute left-2 top-1/2 -translate-y-1/2 text-ds-muted text-10"></i>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search columns..."
            className="w-full pl-7 pr-7 py-1 text-xs border border-line-subtle rounded focus:outline-none focus:ring-1 focus:ring-focus"
            autoFocus
            onClick={e => e.stopPropagation()}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setSearchTerm(''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ds-muted hover:text-ds-secondary"
            >
              <i className="pi pi-times text-10"></i>
            </button>
          )}
        </div>
      </div>

      <div className="px-2 py-1 border-b border-line-subtle flex gap-2 text-10">
        <button type="button" onClick={e => { e.stopPropagation(); showAll(); }} className="text-brand hover:text-brand-hover transition-colors">Show all</button>
        <span className="text-ds-muted">|</span>
        <button type="button" onClick={e => { e.stopPropagation(); hideAll(); }} className="text-ds-secondary hover:text-danger transition-colors">Hide all</button>
        {hiddenCount > 0 && (
          <>
            <span className="text-ds-muted">|</span>
            <span className="text-ds-secondary">{hiddenCount} hidden</span>
          </>
        )}
      </div>

      <div className="max-h-48 overflow-y-auto">
        {filteredColumns.length === 0 ? (
          <div className="px-3 py-3 text-center text-xs text-ds-secondary">No matches</div>
        ) : groupedSections ? (
          groupedSections.map(section => (
            <div key={section.id}>
              {section.label && (
                <div className="px-2 py-1 text-10 font-semibold text-ds-muted uppercase tracking-wide bg-sunken border-b border-line-subtle sticky top-0">
                  {section.label}
                </div>
              )}
              {section.cols.map(col => {
                const isHidden = hiddenSet.has(col.field);
                return (
                  <label
                    key={col.field}
                    className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors text-xs ${isHidden ? 'hover:bg-brand-tint-weak' : 'bg-info-wash hover:bg-brand-tint'}`}
                    onClick={e => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={!isHidden}
                      onChange={() => toggleColumn(col.field)}
                      className="w-3.5 h-3.5 text-brand border-line rounded focus:ring-focus"
                    />
                    <span className={`truncate ${isHidden ? 'text-ds-secondary' : 'text-brand-active font-medium'}`}>
                      {col.header}
                    </span>
                  </label>
                );
              })}
            </div>
          ))
        ) : (
          filteredColumns.map(col => {
            const isHidden = hiddenSet.has(col.field);
            return (
              <label
                key={col.field}
                className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors text-xs ${isHidden ? 'hover:bg-brand-tint-weak' : 'bg-info-wash hover:bg-brand-tint'}`}
                onClick={e => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={!isHidden}
                  onChange={() => toggleColumn(col.field)}
                  className="w-3.5 h-3.5 text-brand border-line rounded focus:ring-focus"
                />
                <span className={`truncate ${isHidden ? 'text-ds-secondary' : 'text-brand-active font-medium'}`}>
                  {col.header}
                </span>
              </label>
            );
          })
        )}
      </div>

      <div className="px-3 py-2 bg-sunken border-t border-line-subtle text-xs text-ds-secondary">
        {columns.length} columns total
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setIsOpen(o => !o); updatePosition(); }}
        title={hiddenCount > 0 ? `${hiddenCount} column${hiddenCount !== 1 ? 's' : ''} hidden` : 'Toggle column visibility'}
        /* Same geometry and states as ActionItem's Button, hand-written only
           because this trigger needs a positioned badge child and a ref. */
        className={`relative h-control aspect-square rounded-md border transition-colors flex items-center justify-center ${
          hiddenCount > 0
            ? 'bg-brand border-transparent text-on-brand hover:bg-brand-hover'
            : 'bg-surface border-line-subtle text-body hover:border-brand-hover hover:text-brand-hover'
        }`}
      >
        <i className="pi pi-eye text-base"></i>
        {hiddenCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-danger text-on-brand text-10 font-bold rounded-full w-5 h-5 flex items-center justify-center leading-none">
            {hiddenCount > 99 ? '99+' : hiddenCount}
          </span>
        )}
      </button>
      {mounted && createPortal(dropdownContent, document.body)}
    </>
  );
}
