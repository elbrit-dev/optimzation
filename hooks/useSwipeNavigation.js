import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';

// Shared state for navigation items across hook instances
let sharedNavigationItems = [];

export function useSwipeNavigation(items) {
  const router = useRouter();
  const pathname = usePathname();
  
  // Using refs to track coordinates to avoid re-renders during move
  const dragStart = useRef({ x: null, y: null });
  const dragEnd = useRef({ x: null, y: null });
  const isDragging = useRef(false);

  // Update shared items when they change
  useEffect(() => {
    if (items && items.length > 0) {
      sharedNavigationItems = items;
    }
  }, [items]);

  const minSwipeDistance = 50;

  const handleStart = (clientX, clientY) => {
    dragStart.current = { x: clientX, y: clientY };
    dragEnd.current = { x: clientX, y: clientY };
    isDragging.current = true;
  };

  const handleMove = (clientX, clientY) => {
    if (!isDragging.current) return;
    dragEnd.current = { x: clientX, y: clientY };
  };

  const handleEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;

    // Only enable swipe on mobile-sized screens
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) return;

    const { x: startX, y: startY } = dragStart.current;
    const { x: endX, y: endY } = dragEnd.current;

    if (startX === null || endX === null || startY === null || endY === null) return;

    const xDistance = startX - endX;
    const yDistance = startY - endY;
    
    // Check if it's more of a horizontal swipe than vertical (1.5x threshold)
    const isHorizontalSwipe = Math.abs(xDistance) > Math.abs(yDistance) * 1.5;
    const isLeftSwipe = xDistance > minSwipeDistance;
    const isRightSwipe = xDistance < -minSwipeDistance;

    if (isHorizontalSwipe && (isLeftSwipe || isRightSwipe)) {
      if (sharedNavigationItems.length === 0) return;

      const validItems = sharedNavigationItems.filter(item => item.path || item.route);
      const currentIndex = validItems.findIndex(item => {
        const itemPath = item.path || item.route;
        return pathname === itemPath || pathname.startsWith(itemPath + '/');
      });

      if (currentIndex === -1) return;

      if (isLeftSwipe && currentIndex < validItems.length - 1) {
        const nextItem = validItems[currentIndex + 1];
        if (nextItem?.path) router.push(nextItem.path, { scroll: false });
      } else if (isRightSwipe && currentIndex > 0) {
        const prevItem = validItems[currentIndex - 1];
        if (prevItem?.path) router.push(prevItem.path, { scroll: false });
      }
    }

    // Reset coordinates
    dragStart.current = { x: null, y: null };
    dragEnd.current = { x: null, y: null };
  }, [pathname, router]);

  // Touch Handlers
  const onTouchStart = (e) => handleStart(e.targetTouches[0].clientX, e.targetTouches[0].clientY);
  const onTouchMove = (e) => handleMove(e.targetTouches[0].clientX, e.targetTouches[0].clientY);
  const onTouchEnd = handleEnd;

  // Mouse Handlers (for testing on desktop)
  const onMouseDown = (e) => handleStart(e.clientX, e.clientY);
  const onMouseMove = (e) => handleMove(e.clientX, e.clientY);
  const onMouseUp = handleEnd;
  const onMouseLeave = handleEnd; // Stop dragging if mouse leaves the area

  // If items are passed, we just want to register them
  if (items) return null;

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave
  };
}
