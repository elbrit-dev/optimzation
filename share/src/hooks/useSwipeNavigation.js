'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';

// Module-level storage to share navigationItems between Navigation and Layout components
let storedNavigationItems = null;

/**
 * Hook for swipe navigation on mobile devices
 * @param {Array} navigationItems - Optional. If provided, stores navigationItems. If not provided, returns handlers.
 * @returns {Object|null} - Returns touch event handlers if navigationItems were previously set, null otherwise
 */
export function useSwipeNavigation(navigationItems) {
  const router = useRouter();
  const pathname = usePathname();
  
  // Touch tracking refs
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const touchEndX = useRef(null);
  const touchEndY = useRef(null);
  const isSwiping = useRef(false);
  const mounted = useRef(false);

  // Mark as mounted
  useEffect(() => {
    if (typeof window === 'undefined') return;
    mounted.current = true;
  }, []);

  // If navigationItems provided, store them (called from Navigation component)
  useEffect(() => {
    if (navigationItems) {
      storedNavigationItems = navigationItems;
    }
  }, [navigationItems]);

  // Get current active index from pathname
  const getCurrentIndex = useCallback(() => {
    if (!storedNavigationItems || !mounted.current) return -1;
    
    const currentPath = pathname;
    const index = storedNavigationItems.findIndex(item => {
      const itemPath = item.path || item.route;
      if (!itemPath) return false;
      return currentPath === itemPath || currentPath.startsWith(itemPath + '/');
    });
    
    return index;
  }, [pathname]);

  // Find the next non-disabled item in a direction
  const findNextNonDisabledIndex = useCallback((startIndex, direction) => {
    if (!storedNavigationItems) return -1;
    
    const maxIndex = storedNavigationItems.length - 1;
    let currentIndex = startIndex;
    
    // direction: -1 for previous (swipe right), 1 for next (swipe left)
    while (true) {
      currentIndex += direction;
      
      // Stop if we've gone out of bounds
      if (currentIndex < 0 || currentIndex > maxIndex) {
        return -1;
      }
      
      // If this item is not disabled, return it
      if (!storedNavigationItems[currentIndex]?.isDisabled) {
        return currentIndex;
      }
    }
  }, []);

  // Navigate to a specific index (only if not disabled)
  const navigateToIndex = useCallback((index) => {
    if (!storedNavigationItems || !mounted.current) return;
    
    const maxIndex = storedNavigationItems.length - 1;
    if (index >= 0 && index <= maxIndex) {
      const item = storedNavigationItems[index];
      // Don't navigate if item is disabled
      if (item?.isDisabled) return;
      if (item?.path) {
        router.push(item.path, { scroll: false });
      }
    }
  }, [router]);

  // Check if mobile (inline check to ensure it's current)
  const checkIsMobile = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1024;
  }, []);

  // Handle touch start
  const handleTouchStart = useCallback((e) => {
    if (!checkIsMobile() || !storedNavigationItems) return;
    
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    isSwiping.current = false;
  }, [checkIsMobile]);

  // Handle touch move
  const handleTouchMove = useCallback((e) => {
    if (!checkIsMobile() || !storedNavigationItems || touchStartX.current === null) return;
    
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartX.current);
    const deltaY = Math.abs(touch.clientY - touchStartY.current);
    
    // If horizontal movement is greater than vertical, it's a swipe
    if (deltaX > deltaY && deltaX > 10) {
      isSwiping.current = true;
      // Prevent default scroll behavior during horizontal swipe
      e.preventDefault();
    }
  }, [checkIsMobile]);

  // Handle touch end
  const handleTouchEnd = useCallback((e) => {
    if (!checkIsMobile() || !storedNavigationItems || touchStartX.current === null) return;
    
    const touch = e.changedTouches[0];
    touchEndX.current = touch.clientX;
    touchEndY.current = touch.clientY;
    
    const deltaX = touchEndX.current - touchStartX.current;
    const deltaY = Math.abs(touchEndY.current - touchStartY.current);
    const absDeltaX = Math.abs(deltaX);
    
    // Minimum swipe distance threshold (50px)
    const minSwipeDistance = 50;
    
    // Only navigate if:
    // 1. It was a horizontal swipe (horizontal movement > vertical)
    // 2. Swipe distance meets threshold
    // 3. It was actually a swipe (not just a tap)
    if (isSwiping.current && absDeltaX > deltaY && absDeltaX > minSwipeDistance) {
      const currentIndex = getCurrentIndex();
      
      if (currentIndex >= 0) {
        if (deltaX > 0) {
          // Swipe right - go to previous non-disabled page
          const prevIndex = findNextNonDisabledIndex(currentIndex, -1);
          if (prevIndex >= 0) {
            navigateToIndex(prevIndex);
          }
          // If prevIndex is -1, no non-disabled item exists in that direction, no action needed
        } else {
          // Swipe left - go to next non-disabled page
          const nextIndex = findNextNonDisabledIndex(currentIndex, 1);
          if (nextIndex >= 0) {
            navigateToIndex(nextIndex);
          }
          // If nextIndex is -1, no non-disabled item exists in that direction, no action needed
        }
      }
    }
    
    // Reset touch tracking
    touchStartX.current = null;
    touchStartY.current = null;
    touchEndX.current = null;
    touchEndY.current = null;
    isSwiping.current = false;
  }, [checkIsMobile, getCurrentIndex, navigateToIndex, findNextNonDisabledIndex]);

  // If navigationItems provided, this is initialization (Navigation component)
  // Return null as handlers are not needed here
  if (navigationItems) {
    return null;
  }

  // If no navigationItems provided, return handlers (Layout component)
  // Only return handlers if navigationItems were previously set
  if (!storedNavigationItems) {
    return null;
  }

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };
}
