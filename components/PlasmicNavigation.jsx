'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import Navigation from '../share/navigation/components/Navigation';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';

// Import icons to support string-based configuration from Plasmic UI
import ChatIconActive from '../share/components/icons/ChatIconActive';
import ChatIconInactive from '../share/components/icons/ChatIconInactive';
import DoctorIconActive from '../share/components/icons/DoctorIconActive';
import DoctorIconInactive from '../share/components/icons/DoctorIconInactive';
import PlannerIconActive from '../share/components/icons/PlannerIconActive';
import PlannerIconInactive from '../share/components/icons/PlannerIconInactive';
import ProductIconActive from '../share/components/icons/ProductIconActive';
import ProductIconInactive from '../share/components/icons/ProductIconInactive';
import HomeIcon from '../share/components/icons/HomeIcon';

const ICON_REGISTRY = {
  ChatIconActive,
  ChatIconInactive,
  DoctorIconActive,
  DoctorIconInactive,
  PlannerIconActive,
  PlannerIconInactive,
  ProductIconActive,
  ProductIconInactive,
  HomeIcon,
};

/**
 * Helper to convert string icons from Plasmic props into JSX elements
 */
const transformItem = (item) => {
  const newItem = { ...item };

  const renderIcon = (iconValue, isLogo, isActive) => {
    if (!iconValue || typeof iconValue !== 'string') return iconValue;

    if (iconValue.startsWith('/') || iconValue.startsWith('http')) {
      // Match Navigation.jsx logo sizes: 56 for active, 52 for inactive
      const size = isLogo ? (isActive ? 56 : 52) : 24; 
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Image 
            src={iconValue} 
            width={size} 
            height={size} 
            alt="icon" 
            priority={isLogo}
            className="transition-all duration-300"
          />
        </div>
      );
    }

    const IconComp = ICON_REGISTRY[iconValue];
    const size = isLogo ? (isActive ? 56 : 52) : 24;
    return IconComp ? <IconComp width={size} height={size} /> : iconValue;
  };

  const isLogo = item.mobileOnly && item.isDefault;

  if (item.iconActive) {
    newItem.iconActive = renderIcon(item.iconActive, isLogo, true);
  }
  if (item.iconInactive) {
    newItem.iconInactive = renderIcon(item.iconInactive, isLogo, false);
  }

  return newItem;
};

/**
 * A wrapper for the Navigation component from the share folder
 * that acts as a Layout Shell with a children slot.
 */
export default function PlasmicNavigation(props) {
  const { 
    children, 
    items, 
    enableSwipe = true, 
    hideNavigation = false, 
    isDisabled = false, 
    className, 
    desktopWidth = '16rem',
    desktopHeight = 'auto',
    mobileWidth = '100%',
    mobileHeight = '4rem',
    ...rest 
  } = props;
  
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Transform string icon names into JSX elements
  const transformedItems = useMemo(() => {
    if (items && Array.isArray(items)) {
      return items.map(transformItem);
    }
    return undefined;
  }, [JSON.stringify(items)]);

  // Sync isMobile and mounted state (matching Navigation.jsx logic)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    setMounted(true);
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Calculate active index and mobile fullscreen state
  const { activeIndex, isMobileFullscreen } = useMemo(() => {
    if (!transformedItems) return { activeIndex: null, isMobileFullscreen: false };
    
    const index = transformedItems.findIndex(item => {
      const itemPath = item.path || item.route;
      if (!itemPath) return false;
      return pathname === itemPath || pathname.startsWith(itemPath + '/');
    });
    
    const currentItem = index >= 0 ? transformedItems[index] : null;
    return {
      activeIndex: index >= 0 ? index : null,
      isMobileFullscreen: currentItem?.mobileFullscreen === true
    };
  }, [pathname, transformedItems]);

  // Register the items for swipe navigation
  useSwipeNavigation(transformedItems);
  
  // Get swipe handlers for the content area
  const swipeHandlers = useSwipeNavigation();

  // Determine if navigation should be shown (matching Navigation.jsx logic)
  const showNavigation = mounted && !hideNavigation && (!isMobile || !isMobileFullscreen);

  return (
    <div 
      className={`flex bg-gray-50 overflow-hidden relative h-full ${className || ''}`}
    >
      {/* The Navigation bars (Sidebar/Bottom Bar) */}
      {showNavigation && (
        <div className={isDisabled ? 'opacity-50 pointer-events-none' : ''}>
          <Navigation 
            {...rest} 
            items={transformedItems} 
            desktopWidth={desktopWidth}
            desktopHeight={desktopHeight}
            mobileWidth={mobileWidth}
            mobileHeight={mobileHeight}
          />
        </div>
      )}
      
      {/* The Content Area (The Slot) */}
      <div 
        className="flex-1 overflow-y-auto relative" 
        {...(enableSwipe ? (swipeHandlers || {}) : {})}
        style={{ 
          cursor: enableSwipe && mounted && isMobile ? 'grab' : 'default',
          paddingBottom: mounted && isMobile && showNavigation 
            ? `calc(${mobileHeight} + env(safe-area-inset-bottom))` 
            : 0
        }}
      >
        {children}
      </div>
    </div>
  );
}
