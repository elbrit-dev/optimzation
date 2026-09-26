'use client';

import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { isEmpty, includes, filter, toLower, debounce } from 'lodash';

export function MultiselectFilter({ field, value, options = [], onFilter, placeholder = 'Select...' }) {
  const selected = value?.value ?? [];

  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const [localSelected, setLocalSelected] = useState(selected);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setLocalSelected(selected); }, [value]);
  useEffect(() => { setMounted(true); }, []);

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const calculate = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dw = 224;
      const dh = 300;
      const gap = 4;

      let left = rect.left;
      let top = rect.bottom + gap;

      if (left + dw > vw) left = Math.max(8, vw - dw - 8);
      if (left < 8) left = 8;
      if (top + dh > vh) {
        top = rect.top > dh ? rect.top - dh - gap : vh - dh - 8;
      }

      setPosition({ top, left, width: Math.max(rect.width, dw) });
    };

    calculate();
    const update = debounce(calculate, 10);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        onFilter(field, localSelected.length ? { type: 'multiselect', value: localSelected } : null);
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside, true);
    return () => document.removeEventListener('mousedown', handleOutside, true);
  }, [isOpen, localSelected, field, onFilter]);

  const normalizedOptions = useMemo(
    () => options.map(o => (typeof o === 'object' ? o : { label: String(o), value: o })),
    [options]
  );

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return normalizedOptions;
    const term = toLower(searchTerm);
    return filter(normalizedOptions, opt => includes(toLower(String(opt.label)), term));
  }, [normalizedOptions, searchTerm]);

  function toggleValue(val) {
    setLocalSelected(prev =>
      includes(prev, val) ? filter(prev, v => v !== val) : [...prev, val]
    );
  }

  const hasSelection = !isEmpty(localSelected);

  const dropdown = isOpen && mounted ? (
    <div
      ref={dropdownRef}
      className="fixed z-[9999] bg-surface border border-line-subtle rounded-lg shadow-pop overflow-hidden"
      style={{ top: position.top, left: position.left, width: position.width, minWidth: 200, maxWidth: 400 }}
    >
      <div className="p-2 border-b border-line-subtle">
        <div className="relative">
          <i className="pi pi-search absolute left-2 top-1/2 -translate-y-1/2 text-ds-muted text-10" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search..."
            className="w-full pl-7 pr-7 py-1 text-xs border border-line-subtle rounded focus:outline-none focus:ring-1 focus:ring-focus focus:border-brand"
            autoFocus
            onClick={e => e.stopPropagation()}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setSearchTerm(''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ds-muted hover:text-ds-secondary"
            >
              <i className="pi pi-times text-10" />
            </button>
          )}
        </div>
      </div>

      <div className="px-2 py-1 border-b border-line-subtle flex gap-2 text-10">
        <button type="button" onClick={e => { e.stopPropagation(); setLocalSelected(normalizedOptions.map(o => o.value)); }} className="text-brand hover:text-brand-hover">All</button>
        <span className="text-ds-muted">|</span>
        <button type="button" onClick={e => { e.stopPropagation(); setLocalSelected([]); setSearchTerm(''); }} className="text-ds-secondary hover:text-danger">Clear</button>
        {hasSelection && (
          <>
            <span className="text-ds-muted">|</span>
            <span className="text-ds-secondary">{localSelected.length} selected</span>
          </>
        )}
      </div>

      <div className="max-h-40 overflow-y-auto">
        {isEmpty(filteredOptions) ? (
          <div className="px-3 py-3 text-center text-xs text-ds-secondary">No matches</div>
        ) : filteredOptions.map(opt => {
          const isSel = includes(localSelected, opt.value);
          return (
            <label
              key={opt.value}
              className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors text-xs ${isSel ? 'bg-info-wash hover:bg-brand-tint' : 'hover:bg-brand-tint-weak'}`}
              onClick={e => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={isSel}
                onChange={() => toggleValue(opt.value)}
                className="w-3.5 h-3.5 text-brand border-line rounded focus:ring-focus"
              />
              <span className={`truncate ${isSel ? 'text-brand-active font-medium' : 'text-body'}`}>{opt.label}</span>
            </label>
          );
        })}
      </div>

      <div className="px-3 py-2 bg-sunken border-t border-line-subtle text-xs text-ds-secondary">
        {normalizedOptions.length} options
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className="multiselect-filter-container">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(o => !o)}
          className={`w-full flex items-center justify-between px-2 text-xs border rounded bg-surface hover:border-line-strong focus:outline-none focus:ring-1 focus:ring-focus transition-colors ${hasSelection ? 'border-info-border text-brand bg-info-wash' : 'border-line text-ds-secondary'}`}
        >
          <span className="truncate">
            {hasSelection ? `${localSelected.length} selected` : placeholder}
          </span>
          <i className={`pi ${isOpen ? 'pi-chevron-up' : 'pi-chevron-down'} text-10 ml-1 shrink-0`} />
        </button>
      </div>
      {mounted && createPortal(dropdown, document.body)}
    </>
  );
}
