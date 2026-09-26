'use client';

import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { isEmpty, includes, filter, toLower, debounce } from 'lodash';

export default function MultiselectFilter({ value, options, onChange, placeholder = "Select...", fieldName, itemLabel = "Filter", style, className }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  // Use local state for selected values - only apply to parent on blur
  const [localSelectedValues, setLocalSelectedValues] = useState(value || []);
  const [mounted, setMounted] = useState(false);
  
  // Sync local state when value prop changes (from outside)
  useEffect(() => {
    setLocalSelectedValues(value || []);
  }, [value]);

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
      const dropdownWidth = 224; // w-56 = 14rem = 224px
      const dropdownHeight = 300; // Approximate max height
      const gap = 4; // mt-1 = 4px

      let left = rect.left;
      let top = rect.bottom + gap;

      // Adjust horizontal position if dropdown would overflow right
      if (left + dropdownWidth > viewportWidth) {
        left = Math.max(8, viewportWidth - dropdownWidth - 8);
      }

      // Adjust horizontal position if dropdown would overflow left
      if (left < 8) {
        left = 8;
      }

      // Adjust vertical position if dropdown would overflow bottom
      if (top + dropdownHeight > viewportHeight) {
        // Try to show above the trigger
        const spaceAbove = rect.top;
        if (spaceAbove > dropdownHeight) {
          top = rect.top - dropdownHeight - gap;
        } else {
          // Not enough space above, position at bottom of viewport
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

    // Update position on scroll and resize
    const updatePosition = debounce(calculatePosition, 10);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen]);

  // Close dropdown when clicking outside and apply filters
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(event.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
        // Apply filters when closing
        onChange(localSelectedValues);
        setIsOpen(false);
      }
    };

    // Use capture phase to catch clicks before they bubble
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [isOpen, localSelectedValues, onChange]);

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    const term = toLower(searchTerm);
    return filter(options, opt => includes(toLower(String(opt.label)), term));
  }, [options, searchTerm]);

  const toggleValue = (val) => {
    // Update local state only, don't apply filter yet
    if (includes(localSelectedValues, val)) {
      setLocalSelectedValues(filter(localSelectedValues, v => v !== val));
    } else {
      setLocalSelectedValues([...localSelectedValues, val]);
    }
  };

  const clearAll = () => {
    // Update local state only
    setLocalSelectedValues([]);
    setSearchTerm('');
  };

  const selectAll = () => {
    // Update local state only
    setLocalSelectedValues(options.map(o => o.value));
  };

  const dropdownContent = isOpen && mounted ? (
    <div
      ref={dropdownRef}
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

      {/* Quick Actions */}
      <div className="px-2 py-1 border-b border-line-subtle flex gap-2 text-10">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); selectAll(); }}
          className="text-brand hover:text-brand-hover transition-colors"
        >
          All
        </button>
        <span className="text-ds-muted">|</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); clearAll(); }}
          className="text-ds-secondary hover:text-danger transition-colors"
        >
          Clear
        </button>
        {!isEmpty(localSelectedValues) && (
          <>
            <span className="text-ds-muted">|</span>
            <span className="text-ds-secondary">{localSelectedValues.length} selected</span>
          </>
        )}
      </div>

      {/* Options List */}
      <div className="max-h-40 overflow-y-auto">
        {isEmpty(filteredOptions) ? (
          <div className="px-3 py-3 text-center text-xs text-ds-secondary">
            No matches
          </div>
        ) : (
          filteredOptions.map(opt => {
            const isSelected = includes(localSelectedValues, opt.value);
            return (
              <label
                key={opt.value}
                className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors text-xs ${isSelected ? 'bg-info-wash hover:bg-brand-tint' : 'hover:bg-brand-tint-weak'
                  }`}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleValue(opt.value)}
                  className="w-3.5 h-3.5 text-brand border-line rounded focus:ring-focus"
                />
                <span className={`truncate ${isSelected ? 'text-brand-active font-medium' : 'text-body'}`}>
                  {opt.label}
                </span>
              </label>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-sunken border-t border-line-subtle text-xs text-ds-secondary">
        Total {fieldName || 'fields'}: {options.length}
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className="multiselect-filter-container">
        {/* Trigger Button */}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between px-2 text-xs border rounded bg-surface hover:border-line-strong focus:outline-none focus:ring-1 focus:ring-focus transition-colors ${isEmpty(localSelectedValues) ? 'border-line text-ds-secondary' : 'border-info-border text-brand bg-info-wash'
            } ${className || ''}`}
          style={style}
        >
          <span className="truncate">
            {isEmpty(localSelectedValues) ? placeholder : `${localSelectedValues.length} ${itemLabel}${localSelectedValues.length !== 1 ? 's' : ''}`}
          </span>
          <i className={`pi ${isOpen ? 'pi-chevron-up' : 'pi-chevron-down'} text-10 ml-1 shrink-0`}></i>
        </button>
      </div>

      {/* Portal dropdown */}
      {mounted && createPortal(dropdownContent, document.body)}
    </>
  );
}
