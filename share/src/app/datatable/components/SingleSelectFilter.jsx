'use client';

import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { isEmpty, includes, filter, toLower, debounce } from 'lodash';

export default function SingleSelectFilter({ value, options, onChange, placeholder = "Select...", loading = false, fieldName, style, className }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  // Ensure portal target exists
  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate position before rendering to avoid flash
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const calculatePosition = () => {
      if (!triggerRef.current) return;

      const rect = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const dropdownWidth = 224;
      const dropdownHeight = 300;
      const gap = 4;

      let left = rect.left;
      let top = rect.bottom + gap;

      if (left + dropdownWidth > viewportWidth) {
        left = Math.max(8, viewportWidth - dropdownWidth - 8);
      }
      if (left < 8) {
        left = 8;
      }
      if (top + dropdownHeight > viewportHeight) {
        const spaceAbove = rect.top;
        if (spaceAbove > dropdownHeight) {
          top = rect.top - dropdownHeight - gap;
        } else {
          top = viewportHeight - dropdownHeight - 8;
        }
      }

      setPosition({
        top,
        left,
        width: Math.max(rect.width, dropdownWidth)
      });
    };

    calculatePosition();

    const updatePosition = debounce(calculatePosition, 10);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(event.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    const term = toLower(searchTerm);
    return filter(options, opt => includes(toLower(String(opt.label)), term));
  }, [options, searchTerm]);

  const selectValue = (val) => {
    onChange(val);
    setSearchTerm('');
    setIsOpen(false);
  };

  const selectedOption = options?.find(o => o.value === value);
  const hasValue = value != null && value !== '';

  const dropdownContent = isOpen && mounted ? (
    <div
      ref={dropdownRef}
      data-pr-is-overlay
      className="fixed z-[9999] bg-surface border border-line-subtle rounded-lg shadow-pop overflow-hidden"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${position.width}px`,
        minWidth: '200px',
        maxWidth: '400px'
      }}
    >
      {/* Search Input */}
      <div className="p-2 border-b border-line-subtle">
        <div className="relative">
          <i className="pi pi-search absolute left-2 top-1/2 -translate-y-1/2 text-ds-muted text-10"></i>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search..."
            className="w-full pl-7 pr-7 py-1 text-xs border border-line-subtle rounded focus:outline-none focus:ring-1 focus:ring-focus focus:border-brand"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSearchTerm(''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ds-muted hover:text-ds-secondary"
            >
              <i className="pi pi-times text-10"></i>
            </button>
          )}
        </div>
      </div>

      {/* Options List - single select, no checkboxes */}
      <div className="max-h-40 overflow-y-auto">
        {isEmpty(filteredOptions) ? (
          <div className="px-3 py-3 text-center text-xs text-ds-secondary">
            No matches
          </div>
        ) : (
          filteredOptions.map(opt => {
            const isSelected = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={(e) => { e.stopPropagation(); selectValue(opt.value); }}
                className={`w-full text-left flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors text-xs ${isSelected ? 'bg-info-wash hover:bg-brand-tint text-brand-active font-medium' : 'hover:bg-brand-tint-weak text-body'
                  }`}
              >
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })
        )}
      </div>

      {/* Footer */}
      {fieldName && (
        <div className="px-3 py-2 bg-sunken border-t border-line-subtle text-xs text-ds-secondary">
          Total {fieldName}: {options.length}
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <div className="multiselect-filter-container">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => !loading && setIsOpen(!isOpen)}
          disabled={loading}
          className={`w-full flex items-center justify-between px-2 text-xs border rounded bg-surface hover:border-line-strong focus:outline-none focus:ring-1 focus:ring-focus transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${!hasValue ? 'border-line text-ds-secondary' : 'border-info-border text-brand bg-info-wash'
            } ${className || ''}`}
          style={style}
        >
          <span className="truncate">
            {loading ? 'Loading...' : (!hasValue ? placeholder : (selectedOption?.label ?? String(value)))}
          </span>
          <i className={`pi ${isOpen ? 'pi-chevron-up' : 'pi-chevron-down'} text-10 ml-1 shrink-0`}></i>
        </button>
      </div>

      {mounted && createPortal(dropdownContent, document.body)}
    </>
  );
}
