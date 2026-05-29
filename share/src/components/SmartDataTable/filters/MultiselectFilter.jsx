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
      className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
      style={{ top: position.top, left: position.left, width: position.width, minWidth: 200, maxWidth: 400 }}
    >
      <div className="p-2 border-b border-gray-100">
        <div className="relative">
          <i className="pi pi-search absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search..."
            className="w-full pl-7 pr-7 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            autoFocus
            onClick={e => e.stopPropagation()}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setSearchTerm(''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <i className="pi pi-times text-[10px]" />
            </button>
          )}
        </div>
      </div>

      <div className="px-2 py-1 border-b border-gray-100 flex gap-2 text-[10px]">
        <button type="button" onClick={e => { e.stopPropagation(); setLocalSelected(normalizedOptions.map(o => o.value)); }} className="text-blue-600 hover:text-blue-800">All</button>
        <span className="text-gray-300">|</span>
        <button type="button" onClick={e => { e.stopPropagation(); setLocalSelected([]); setSearchTerm(''); }} className="text-gray-500 hover:text-red-600">Clear</button>
        {hasSelection && (
          <>
            <span className="text-gray-300">|</span>
            <span className="text-gray-500">{localSelected.length} selected</span>
          </>
        )}
      </div>

      <div className="max-h-40 overflow-y-auto">
        {isEmpty(filteredOptions) ? (
          <div className="px-3 py-3 text-center text-xs text-gray-500">No matches</div>
        ) : filteredOptions.map(opt => {
          const isSel = includes(localSelected, opt.value);
          return (
            <label
              key={opt.value}
              className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors text-xs ${isSel ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}`}
              onClick={e => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={isSel}
                onChange={() => toggleValue(opt.value)}
                className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className={`truncate ${isSel ? 'text-blue-900 font-medium' : 'text-gray-700'}`}>{opt.label}</span>
            </label>
          );
        })}
      </div>

      <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
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
          className={`w-full flex items-center justify-between px-2 text-xs border rounded bg-white hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors ${hasSelection ? 'border-blue-400 text-blue-700 bg-blue-50' : 'border-gray-300 text-gray-500'}`}
        >
          <span className="truncate">
            {hasSelection ? `${localSelected.length} selected` : placeholder}
          </span>
          <i className={`pi ${isOpen ? 'pi-chevron-up' : 'pi-chevron-down'} text-[10px] ml-1 shrink-0`} />
        </button>
      </div>
      {mounted && createPortal(dropdown, document.body)}
    </>
  );
}
