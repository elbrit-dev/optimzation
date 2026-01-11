'use client';

import React from 'react';
import Image from 'next/image';
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
  const { children, items, enableSwipe = true, hideNavigation = false, isDisabled = false, className, ...rest } = props;
  
  // Transform string icon names into JSX elements
  const transformedItems = React.useMemo(() => {
    if (items && Array.isArray(items)) {
      return items.map(transformItem);
    }
    return undefined;
  }, [items]);

  // Get swipe handlers for the content area
  const swipeHandlers = useSwipeNavigation();

  return (
    <div 
      className={`flex bg-gray-50 overflow-hidden relative ${className || ''}`}
    >
      {/* The Navigation bars (Sidebar/Bottom Bar) */}
      {!hideNavigation && (
        <div className={isDisabled ? 'opacity-50 pointer-events-none' : ''}>
          <Navigation {...rest} items={transformedItems} />
        </div>
      )}
      
      {/* The Content Area (The Slot) */}
      <div 
        className="flex-1 overflow-y-auto relative" 
        {...(enableSwipe ? (swipeHandlers || {}) : {})}
        style={{ cursor: enableSwipe && typeof window !== 'undefined' && window.innerWidth < 1024 ? 'grab' : 'default' }}
      >
        {children}
      </div>
    </div>
  );
}
