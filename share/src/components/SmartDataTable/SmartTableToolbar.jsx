'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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

const COLOR_CLASSES = {
  default: { on: 'bg-blue-600 text-white hover:bg-blue-700', off: 'bg-gray-200 text-gray-700 hover:bg-gray-300' },
  green:   { on: 'bg-green-600 text-white hover:bg-green-700', off: 'bg-green-600 text-white hover:bg-green-700' },
  purple:  { on: 'bg-purple-600 text-white hover:bg-purple-700', off: 'bg-purple-600 text-white hover:bg-purple-700' },
  indigo:  { on: 'bg-indigo-600 text-white hover:bg-indigo-700', off: 'bg-indigo-600 text-white hover:bg-indigo-700' },
  red:     { on: 'bg-red-600 text-white hover:bg-red-700', off: 'bg-red-600 text-white hover:bg-red-700' },
};

function ActionItem({ action }) {
  if (action.type === 'custom') return action.render();

  const scheme = COLOR_CLASSES[action.color ?? 'default'];
  const colorCls = action.active ? scheme.on : scheme.off;

  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      title={action.title}
      className={`p-2 rounded-lg transition-colors flex items-center justify-center disabled:bg-gray-300 disabled:cursor-not-allowed ${colorCls}`}
    >
      <i className={`pi ${action.icon} text-base`}></i>
    </button>
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

  if (!groups.length) return null;

  const dropdownContent = isOpen && mounted ? (
    <div
      ref={dropdownRef}
      className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
      style={{ top: `${position.top}px`, left: `${position.left}px`, minWidth: '200px', maxWidth: '320px' }}
    >
      <div className="px-3 py-2 border-b border-gray-100 text-[10px] font-medium text-gray-500 uppercase tracking-wide">
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
              ${dragIdx === idx ? 'opacity-40 bg-gray-50' : ''}
              ${overIdx === idx && dragIdx !== idx ? 'bg-blue-50 border-t-2 border-blue-400' : 'hover:bg-gray-50'}
            `}
          >
            <i className="pi pi-bars text-gray-400 text-xs flex-none" />
            <span className="flex-1 truncate text-gray-800">{group}</span>
            <span className="flex-none w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-bold flex items-center justify-center leading-none">
              {idx + 1}
            </span>
          </div>
        ))}
      </div>
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
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
        className={`relative p-2 rounded-lg transition-colors flex items-center justify-center ${
          isOpen ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
        }`}
      >
        <i className="pi pi-sort-alt text-base" />
        <span className="absolute -top-1 -right-1 bg-indigo-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center leading-none">
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
export function ColumnVisibilityDropdown({ columns, hiddenColumns, onChange }) {
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

  const filteredColumns = useMemo(() => {
    if (!searchTerm) return columns;
    const term = searchTerm.toLowerCase();
    return columns.filter(c => c.header.toLowerCase().includes(term));
  }, [columns, searchTerm]);

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
      className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
      style={{ top: `${position.top}px`, left: `${position.left}px`, minWidth: '200px', maxWidth: '360px' }}
    >
      <div className="p-2 border-b border-gray-100">
        <div className="relative">
          <i className="pi pi-search absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]"></i>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search columns..."
            className="w-full pl-7 pr-7 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
            onClick={e => e.stopPropagation()}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setSearchTerm(''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <i className="pi pi-times text-[10px]"></i>
            </button>
          )}
        </div>
      </div>

      <div className="px-2 py-1 border-b border-gray-100 flex gap-2 text-[10px]">
        <button type="button" onClick={e => { e.stopPropagation(); showAll(); }} className="text-blue-600 hover:text-blue-800 transition-colors">Show all</button>
        <span className="text-gray-300">|</span>
        <button type="button" onClick={e => { e.stopPropagation(); hideAll(); }} className="text-gray-500 hover:text-red-600 transition-colors">Hide all</button>
        {hiddenCount > 0 && (
          <>
            <span className="text-gray-300">|</span>
            <span className="text-gray-500">{hiddenCount} hidden</span>
          </>
        )}
      </div>

      <div className="max-h-48 overflow-y-auto">
        {filteredColumns.length === 0 ? (
          <div className="px-3 py-3 text-center text-xs text-gray-500">No matches</div>
        ) : (
          filteredColumns.map(col => {
            const isHidden = hiddenSet.has(col.field);
            return (
              <label
                key={col.field}
                className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors text-xs ${isHidden ? 'hover:bg-gray-50' : 'bg-blue-50 hover:bg-blue-100'}`}
                onClick={e => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={!isHidden}
                  onChange={() => toggleColumn(col.field)}
                  className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className={`truncate ${isHidden ? 'text-gray-500' : 'text-blue-900 font-medium'}`}>
                  {col.header}
                </span>
              </label>
            );
          })
        )}
      </div>

      <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
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
        className={`relative p-2 rounded-lg transition-colors flex items-center justify-center ${
          hiddenCount > 0 ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
        }`}
      >
        <i className="pi pi-eye text-base"></i>
        {hiddenCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center leading-none">
            {hiddenCount > 99 ? '99+' : hiddenCount}
          </span>
        )}
      </button>
      {mounted && createPortal(dropdownContent, document.body)}
    </>
  );
}
