'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useRouter, usePathname } from 'next/navigation';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import ChatIconActive from '@/components/icons/ChatIconActive';
import ChatIconInactive from '@/components/icons/ChatIconInactive';
import DoctorIconActive from '@/components/icons/DoctorIconActive';
import DoctorIconInactive from '@/components/icons/DoctorIconInactive';
import PlannerIconActive from '@/components/icons/PlannerIconActive';
import PlannerIconInactive from '@/components/icons/PlannerIconInactive';
import ProductIconActive from '@/components/icons/ProductIconActive';
import ProductIconInactive from '@/components/icons/ProductIconInactive';
import HomeIcon from '@/components/icons/HomeIcon';

// Icon mapping - maps keys to icon components
const ICON_MAP = {
  planner: {
    active: PlannerIconActive,
    inactive: PlannerIconInactive,
    defaultProps: { width: 24, height: 24 }
  },
  doctor: {
    active: DoctorIconActive,
    inactive: DoctorIconInactive,
    defaultProps: { width: 24, height: 24 }
  },
  home: {
    active: HomeIcon,
    inactive: HomeIcon,
    defaultProps: { width: 56, height: 56 },
    inactiveProps: { width: 52, height: 52 }
  },
  products: {
    active: ProductIconActive,
    inactive: ProductIconInactive,
    defaultProps: { width: 24, height: 24 }
  },
  chat: {
    active: ChatIconActive,
    inactive: ChatIconInactive,
    defaultProps: { width: 24, height: 24 }
  },
};

// Helper function to resolve icon component from key
const resolveIcon = (iconKey, variant, iconMap, customProps = {}) => {
  if (!iconKey || !iconMap[iconKey]) return null;
  
  const iconConfig = iconMap[iconKey];
  const IconComponent = variant === 'active' ? iconConfig.active : iconConfig.inactive;
  
  if (!IconComponent) return null;
  
  // Use inactive-specific props if available, otherwise use default props
  const props = variant === 'inactive' && iconConfig.inactiveProps 
    ? { ...iconConfig.defaultProps, ...iconConfig.inactiveProps, ...customProps }
    : { ...iconConfig.defaultProps, ...customProps };
  
  return <IconComponent {...props} />;
};

// Default navigation items - now using keys instead of components
const DEFAULT_NAVIGATION_ITEMS = [
  {
    label: 'Planner',
    path: '/planner',
    mobileFullscreen: true,
    mobileOnly: false,
    iconKey: 'planner',
  },
  {
    label: 'Doctor',
    path: '/doctor',
    mobileFullscreen: false,
    mobileOnly: false,
    iconKey: 'doctor',
  },
  {
    path: '/home',
    mobileFullscreen: false,
    mobileOnly: true,
    isDefault: true,
    iconKey: 'home',
  },
  {
    label: 'Products',
    path: '/products',
    mobileFullscreen: false,
    mobileOnly: false,
    iconKey: 'products',
  },
  {
    label: 'Chat',
    path: '/chat',
    mobileFullscreen: true,
    mobileOnly: false,
    iconKey: 'chat',
  },
];

const Navigation = ({
  items,
  defaultIndex = 0,
  desktopWidth = '16rem', // Default: w-64
  desktopHeight = '93dvh', // Default: auto (flex-1)
  mobileWidth = '100%', // Default: full width
  mobileHeight = '4rem', // Default: h-16
  showCollapse = true, // Default: true
  iconMap = ICON_MAP // Allow custom icon mapping
}) => {
  // Debug: Component initialization


  // Use provided items or default items
  const navigationItems = items || DEFAULT_NAVIGATION_ITEMS;

  // Resolve icons from keys for navigation items
  const resolvedItems = useMemo(() => {
    return navigationItems.map(item => {
      // If item already has iconActive/iconInactive components, use them (backward compatibility)
      if (item.iconActive || item.iconInactive || item.icon) {
        return item;
      }
      
      // Otherwise, resolve from iconKey
      if (item.iconKey) {
        return {
          ...item,
          iconActive: resolveIcon(item.iconKey, 'active', iconMap),
          iconInactive: resolveIcon(item.iconKey, 'inactive', iconMap),
        };
      }
      
      return item;
    });
  }, [navigationItems, iconMap]);

  // Debug: Navigation items validation


  // Initialize swipe navigation hook with resolvedItems
  useSwipeNavigation(resolvedItems);

  // Validate that only one item has isDefault: true
  useEffect(() => {
    const defaultItemsCount = resolvedItems.filter(item => item.isDefault === true).length;

    if (defaultItemsCount > 1) {

    } else if (defaultItemsCount === 0) {

    }
  }, [resolvedItems]);

  const router = useRouter();
  const pathname = usePathname();
  const [activeIndex, setActiveIndex] = useState(null);
  // Always start with false to match server render, then update on client
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Debug: Initial state


  // Check if mobile on mount and resize - only after hydration
  useEffect(() => {
    if (typeof window === 'undefined') {

      return;
    }

    // Mark as mounted to prevent hydration mismatch
    setMounted(true);


    const checkMobile = () => {
      const windowWidth = window.innerWidth;
      const isMobileNow = windowWidth < 1024;

      setIsMobile(isMobileNow);
    };
    // Check immediately
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => {

      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // Sync activeIndex with URL pathname
  useEffect(() => {
    if (!mounted) {

      return;
    }
    const currentPath = pathname;


    const index = resolvedItems.findIndex(item => {
      const itemPath = item.path || item.route;
      if (!itemPath) {

        return false;
      }
      // Exact match or pathname starts with item path (for nested routes)
      const matches = currentPath === itemPath || currentPath.startsWith(itemPath + '/');
      if (matches) {

      }
      return matches;
    });

    if (index >= 0 && index !== activeIndex) {

      setActiveIndex(index);
    } else if (index < 0) {

      setActiveIndex(null);
    } else {

    }
  }, [mounted, pathname, resolvedItems, activeIndex]);

  const navigateToIndex = (index) => {
    const maxIndex = resolvedItems.length - 1;


    if (index >= 0 && index <= maxIndex) {
      const item = resolvedItems[index];


      if (item?.path && mounted) {

        router.push(item.path, { scroll: false });
      } else if (!item?.path) {

      } else if (!mounted) {

      }
    } else {

    }
  };

  const handleItemClick = (index) => {
    const item = resolvedItems[index];


    // Don't navigate if item is disabled
    if (item?.isDisabled) {

      return;
    }
    navigateToIndex(index);
  };

  // Use only the items array length (order of navigation items determines everything)
  const maxItems = resolvedItems.length;

  // Check if current route has mobileFullscreen enabled
  const currentItem = activeIndex !== null ? resolvedItems[activeIndex] : null;
  const isMobileFullscreen = activeIndex !== null && currentItem?.mobileFullscreen === true;

  return (
    <>
      {/* Sidebar Navigation - Desktop */}
      {mounted && !isMobile && (
        <motion.aside
          initial={{ x: -100, opacity: 0 }}
          animate={{
            x: 0,
            opacity: 1,
            width: isCollapsed ? '5rem' : desktopWidth
          }}
          transition={{ duration: 0.3 }}
          className="bg-white border-r border-gray-200 flex flex-col shadow-sm overflow-x-hidden"
          style={{
            height: desktopHeight === 'auto' ? 'auto' : desktopHeight,
          }}
        >
          <nav className={`flex-1 flex flex-col ${isCollapsed ? 'p-1' : 'p-2'}`}>
            <div className={`flex-1 overflow-y-auto overflow-x-hidden ${isCollapsed ? 'flex flex-col items-center' : ''}`}>
              {resolvedItems.map((item, index) => {
                // Skip mobileOnly items in desktop sidebar
                if (item.mobileOnly) {

                  return null;
                }
                const isDisabled = item.isDisabled === true;
                const isActive = activeIndex === index;


                return (
                  <motion.button
                    key={item.path || item.route || index}
                    onClick={() => handleItemClick(index)}
                    disabled={isDisabled}
                    className={`w-full ${isCollapsed ? 'flex justify-center px-1 py-2' : 'text-left px-4 py-3'} rounded-lg ${isCollapsed ? 'mb-0.5' : 'mb-1'} transition-colors ${isDisabled
                      ? 'opacity-50 cursor-not-allowed text-gray-400'
                      : isActive
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    whileHover={isDisabled ? {} : { scale: 1.02 }}
                    whileTap={isDisabled ? {} : { scale: 0.98 }}
                  >
                    <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                      {item.iconActive && activeIndex === index && (
                        <div className="text-xl">{item.iconActive}</div>
                      )}
                      {item.iconInactive && activeIndex !== index && (
                        <div className="text-xl">{item.iconInactive}</div>
                      )}
                      {item.icon && !item.iconActive && !item.iconInactive && (
                        <div className="text-xl">{item.icon}</div>
                      )}
                      {!isCollapsed && <span className="text-sm">{item.label}</span>}
                    </div>
                  </motion.button>
                );
              })}
            </div>
            {/* Collapse Button */}
            {showCollapse && (
              <motion.button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className={`w-full ${isCollapsed ? 'px-1 py-2' : 'px-4 py-3'} rounded-lg ${isCollapsed ? 'mt-1' : 'mt-2'} text-gray-700 hover:bg-gray-100 transition-colors flex items-center ${isCollapsed ? 'justify-center' : 'justify-start gap-3'}`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isCollapsed ? (
                  <i className="pi pi-chevron-right"></i>
                ) : (
                  <>
                    <i className="pi pi-chevron-left"></i>
                    <span className="text-sm">Collapse</span>
                  </>
                )}
              </motion.button>
            )}
          </nav>
        </motion.aside>
      )}

      {/* Bottom Navigation - Mobile */}
      {mounted && isMobile && maxItems > 0 && !isMobileFullscreen && (
        <motion.nav
          initial={false}
          animate={{ y: 0, opacity: 1 }}
          className="bg-white border-t border-gray-200 shadow-lg safe-area-bottom flex-shrink-0 z-10 fixed bottom-0 left-0 right-0"
          style={{
            width: mobileWidth,
            height: mobileHeight,
          }}
        >
          <div className="flex justify-around items-center px-2 relative" style={{ height: mobileHeight }}>
            {resolvedItems.map((item, index) => {
              const isDisabled = item.isDisabled === true;
              return (
                <motion.button
                  key={item.path || item.route || index}
                  onClick={() => handleItemClick(index)}
                  disabled={isDisabled}
                  className={`relative flex flex-col items-center justify-center flex-1 h-full rounded-lg transition-colors ${isDisabled
                    ? 'opacity-50 cursor-not-allowed text-gray-400'
                    : activeIndex === index
                      ? 'text-blue-600'
                      : 'text-gray-500'
                    }`}
                  whileTap={isDisabled ? {} : { scale: 0.9 }}
                >
                  {item.iconActive && activeIndex === index && (
                    <motion.div
                      animate={{
                        scale: 1.1,
                      }}
                      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                      className="mb-1"
                    >
                      {item.iconActive}
                    </motion.div>
                  )}
                  {item.iconInactive && activeIndex !== index && (
                    <motion.div
                      animate={{
                        scale: 1,
                      }}
                      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                      className="mb-1"
                    >
                      {item.iconInactive}
                    </motion.div>
                  )}
                  {item.icon && !item.iconActive && !item.iconInactive && (
                    <motion.div
                      animate={{
                        scale: activeIndex === index ? 1.1 : 1,
                      }}
                      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                      className="mb-1"
                    >
                      {item.icon}
                    </motion.div>
                  )}
                  <span className="text-xs font-medium">{item.label}</span>
                </motion.button>
              );
            })}
            {/* Active indicator */}
            {activeIndex !== null && (
              <motion.div
                className="absolute bottom-0 h-1 bg-blue-600 rounded-t-full"
                layoutId="activeIndicator"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                style={{
                  width: `${100 / maxItems}%`,
                  left: `${(activeIndex * 100) / maxItems}%`,
                }}
              />
            )}
          </div>
        </motion.nav>
      )}
    </>
  );
};

export default Navigation;

