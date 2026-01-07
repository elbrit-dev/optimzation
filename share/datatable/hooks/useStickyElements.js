'use client';

import { useState, useEffect } from 'react';
import { debounce } from 'lodash';

/**
 * ASSUMPTIONS:
 * 1. appHeaderOffset is always provided (number, never null)
 * 2. All refs are always provided and valid (tableContainerRef, tableRef, stickyHeaderRef, stickyFooterRef)
 * 3. Table selector is always 'table.p-datatable-table' (PrimeReact standard)
 * 4. Table structure always has thead (tfoot is optional)
 * 5. Debounce times are constants: 50ms for scroll, 100ms for resize
 * 6. Initial check delay is 200ms (constant)
 * 7. Hook is always enabled (no enabled flag needed)
 * 
 * Custom hook to manage sticky header and footer with full page control
 * 
 * @param {Object} options - Configuration options
 * @param {React.RefObject} options.tableContainerRef - Ref to the table container element
 * @param {React.RefObject} options.tableRef - Ref to the table element
 * @param {React.RefObject} options.stickyHeaderRef - Ref to the sticky header element
 * @param {React.RefObject} options.stickyFooterRef - Ref to the sticky footer element
 * @param {number} options.appHeaderOffset - App header height (always required)
 * @param {number} options.stickyHeaderOffset - Additional offset for sticky header (default: 0)
 * 
 * @param {Function|null} options.shouldShowHeader - Custom function to determine header visibility
 *   Receives: { tableElement, thead, containerRect, headerRect, scrollY, viewportHeight, totalHeaderOffset }
 *   Returns: boolean
 * 
 * @param {Function|null} options.shouldShowFooter - Custom function to determine footer visibility
 *   Receives: { tableElement, tfoot, containerRect, footerRect, scrollY, viewportHeight }
 *   Returns: boolean
 * 
 * @param {Function|null} options.calculateHeaderPosition - Custom function to calculate header position
 *   Receives: { containerRect, tableElement, thead, headerRect, totalHeaderOffset }
 *   Returns: { width, left, top } or null to hide
 * 
 * @param {Function|null} options.calculateFooterPosition - Custom function to calculate footer position
 *   Receives: { containerRect, tableElement, tfoot, footerRect }
 *   Returns: { width, left, bottom } or null to hide
 * 
 * @param {boolean|Function} options.manualControl - If true, hook only provides state, page controls visibility
 *   If function, receives state object and returns visibility flags
 * 
 * @returns {Object} - Sticky elements state and position info
 */
export function useStickyElements({
  tableContainerRef,
  tableRef,
  stickyHeaderRef,
  stickyFooterRef,
  appHeaderOffset, // Required, always provided
  stickyHeaderOffset = 0,
  
  // Custom visibility functions
  shouldShowHeader = null,
  shouldShowFooter = null,
  
  // Custom position functions
  calculateHeaderPosition = null,
  calculateFooterPosition = null,
  
  // Manual control
  manualControl = false,
  
  // Table identifier for logging
  tableName = 'table',
  
  // Z-index for sticky header
  stickyHeaderZIndex = 1000,
}) {
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [showStickyFooter, setShowStickyFooter] = useState(false);
  const [headerPosition, setHeaderPosition] = useState({ width: 0, left: 0, top: 0 });
  const [footerPosition, setFooterPosition] = useState({ width: 0, left: 0, bottom: 0 });
  
  // Expose internal state for manual control
  const [internalState, setInternalState] = useState({
    tableElement: null,
    thead: null,
    tfoot: null,
    containerRect: null,
    headerRect: null,
    footerRect: null,
    scrollY: 0,
    viewportHeight: 0,
  });

  // Constants (assumptions)
  const TABLE_SELECTOR = 'table.p-datatable-table';
  const SCROLL_DEBOUNCE_MS = 50;
  const RESIZE_DEBOUNCE_MS = 100;
  const INITIAL_CHECK_DELAY_MS = 200;
  const POSITION_SYNC_DELAY_MS = 10;

  const totalHeaderOffset = stickyHeaderOffset + (appHeaderOffset || 0);

  // Default visibility functions
  const defaultShouldShowHeader = ({ headerRect, containerRect, appHeaderOffset }) => {
    const viewportTopWithOffset = appHeaderOffset || 0;
    const condition1 = headerRect.bottom < (containerRect.top + viewportTopWithOffset);
    const condition2 = headerRect.top < viewportTopWithOffset;
    const result = condition1 || condition2;
    
    return result;
  };

  const defaultShouldShowFooter = ({ footerRect }) => {
    return footerRect.top > window.innerHeight;
  };

  // Default position functions
  const defaultCalculateHeaderPosition = ({ containerRect, totalHeaderOffset }) => ({
    width: containerRect.width,
    left: containerRect.left,
    top: totalHeaderOffset
  });

  const defaultCalculateFooterPosition = ({ containerRect }) => ({
    width: containerRect.width,
    left: containerRect.left,
    bottom: 0
  });

  // Visibility detection logic
  useEffect(() => {
    if (!tableContainerRef.current || !tableRef.current) {
      return;
    }

    const checkVisibility = () => {
      if (!tableRef.current || !tableContainerRef.current) {
        return;
      }
      const tableElement = tableRef.current.querySelector(TABLE_SELECTOR);
      if (!tableElement) {
        return;
      }

      const thead = tableElement.querySelector('thead');
      const tfoot = tableElement.querySelector('tfoot');
      const containerRect = tableContainerRef.current.getBoundingClientRect();
      const scrollY = window.scrollY;
      const viewportHeight = window.innerHeight;

      // Update internal state for manual control
      const state = {
        tableElement,
        thead,
        tfoot,
        containerRect,
        headerRect: thead?.getBoundingClientRect() || null,
        footerRect: tfoot?.getBoundingClientRect() || null,
        scrollY,
        viewportHeight,
      };
      setInternalState(state);

      // Check header visibility
      if (thead) {
        const headerRect = thead.getBoundingClientRect();
        const context = {
          tableElement,
          thead,
          containerRect,
          headerRect,
          scrollY,
          viewportHeight,
          appHeaderOffset: appHeaderOffset || 0,
          totalHeaderOffset,
        };

        let shouldShow;
        if (typeof manualControl === 'function') {
          const result = manualControl({ ...state, type: 'header', context });
          shouldShow = result?.showHeader ?? false;
        } else if (manualControl === true) {
          return; // Manual control - don't auto-update
        } else if (shouldShowHeader) {
          shouldShow = shouldShowHeader(context);
        } else {
          shouldShow = defaultShouldShowHeader({
            headerRect,
            containerRect,
            appHeaderOffset: appHeaderOffset || 0
          });
        }

        setShowStickyHeader(prev => {
          if (prev !== shouldShow) {
            return shouldShow;
          }
          return prev;
        });
      }

      // Check footer visibility
      if (tfoot) {
        const footerRect = tfoot.getBoundingClientRect();
        const context = {
          tableElement,
          tfoot,
          containerRect,
          footerRect,
          scrollY,
          viewportHeight,
        };

        let shouldShow;
        if (typeof manualControl === 'function') {
          const result = manualControl({ ...state, type: 'footer', context });
          shouldShow = result?.showFooter ?? false;
        } else if (manualControl === true) {
          return; // Manual control - don't auto-update
        } else if (shouldShowFooter) {
          shouldShow = shouldShowFooter(context);
        } else {
          shouldShow = defaultShouldShowFooter({ footerRect });
        }

        setShowStickyFooter(prev => prev !== shouldShow ? shouldShow : prev);
      }
    };

    const timeoutId = setTimeout(checkVisibility, INITIAL_CHECK_DELAY_MS);

    const handleScroll = debounce(checkVisibility, SCROLL_DEBOUNCE_MS);
    window.addEventListener('scroll', handleScroll, true);
    
    const handleResize = debounce(checkVisibility, RESIZE_DEBOUNCE_MS);
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      handleScroll.cancel();
      handleResize.cancel();
    };
  }, [
    tableContainerRef,
    tableRef,
    appHeaderOffset,
    totalHeaderOffset,
    shouldShowHeader,
    shouldShowFooter,
    manualControl,
  ]);

  // Position calculation logic
  useEffect(() => {
    if (!tableRef.current || !tableContainerRef.current) {
      return;
    }

    const calculatePositions = () => {
      if (!tableRef.current || !tableContainerRef.current) {
        return;
      }
      const tableElement = tableRef.current.querySelector(TABLE_SELECTOR);
      if (!tableElement) {
        return;
      }

      const containerRect = tableContainerRef.current.getBoundingClientRect();
      const thead = tableElement.querySelector('thead');
      const tfoot = tableElement.querySelector('tfoot');

      // Calculate header position
      if (stickyHeaderRef.current && showStickyHeader) {
        const headerRect = thead?.getBoundingClientRect() || null;
        const context = {
          containerRect,
          tableElement,
          thead,
          headerRect,
          totalHeaderOffset,
        };

        const position = calculateHeaderPosition
          ? calculateHeaderPosition(context)
          : defaultCalculateHeaderPosition({ containerRect, totalHeaderOffset });

        if (position) {
          setHeaderPosition(position);
        }
      }

      // Calculate footer position
      if (stickyFooterRef.current && showStickyFooter) {
        const footerRect = tfoot?.getBoundingClientRect() || null;
        const context = {
          containerRect,
          tableElement,
          tfoot,
          footerRect,
        };

        const position = calculateFooterPosition
          ? calculateFooterPosition(context)
          : defaultCalculateFooterPosition({ containerRect });

        if (position) {
          setFooterPosition(position);
        }
      }
    };

    if (showStickyHeader || showStickyFooter) {
      setTimeout(calculatePositions, POSITION_SYNC_DELAY_MS);
    }

    const debouncedCalculate = debounce(calculatePositions, SCROLL_DEBOUNCE_MS);
    window.addEventListener('resize', debouncedCalculate);
    window.addEventListener('scroll', debouncedCalculate, true);

    return () => {
      window.removeEventListener('resize', debouncedCalculate);
      window.removeEventListener('scroll', debouncedCalculate, true);
      debouncedCalculate.cancel();
    };
  }, [
    tableRef,
    tableContainerRef,
    stickyHeaderRef,
    stickyFooterRef,
    showStickyHeader,
    showStickyFooter,
    totalHeaderOffset,
    calculateHeaderPosition,
    calculateFooterPosition,
  ]);

  return {
    // Visibility states
    showStickyHeader,
    showStickyFooter,
    
    // Positions
    headerPosition,
    footerPosition,
    
    // Configuration
    totalHeaderOffset,
    stickyHeaderZIndex,
    
    // Internal state for manual control
    internalState,
    
    // Manual control functions
    setShowStickyHeader,
    setShowStickyFooter,
    setHeaderPosition,
    setFooterPosition,
  };
}

