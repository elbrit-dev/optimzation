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

// Default navigation items
const DEFAULT_NAVIGATION_ITEMS = [
  {
    label: 'Planner',
    path: '/planner',
    mobileFullscreen: true,
    mobileOnly: false,
    iconActive: <PlannerIconActive width={24} height={24} />,
    iconInactive: <PlannerIconInactive width={24} height={24} />,
  },
  {
    label: 'Doctor',
    path: '/doctor',
    mobileFullscreen: false,
    mobileOnly: false,
    iconActive: <DoctorIconActive width={24} height={24} />,
    iconInactive: <DoctorIconInactive width={24} height={24} />,
  },
  {
    path: '/home',
    mobileFullscreen: false,
    mobileOnly: true,
    isDefault: true,
    iconActive: <HomeIcon width={56} height={56} />,
    iconInactive: <HomeIcon width={52} height={52} />,
  },
  {
    label: 'Products',
    path: '/products',
    mobileFullscreen: false,
    mobileOnly: false,
    iconActive: <ProductIconActive width={24} height={24} />,
    iconInactive: <ProductIconInactive width={24} height={24} />,
  },
  {
    label: 'Chat',
    path: '/chat',
    mobileFullscreen: true,
    mobileOnly: false,
    iconActive: <ChatIconActive width={24} height={24} />,
    iconInactive: <ChatIconInactive width={24} height={24} />,
  },
];

const Navigation = ({ 
  items, 
  defaultIndex = 0,
  desktopWidth = '16rem', // Default: w-64
  desktopHeight = 'auto', // Default: auto (flex-1)
  mobileWidth = '100%', // Default: full width
  mobileHeight = '4rem' // Default: h-16
}) => {
  // Use provided items or default items
  const navigationItems = items || DEFAULT_NAVIGATION_ITEMS;

  // Initialize swipe navigation hook with navigationItems
  useSwipeNavigation(navigationItems);

  // Validate that only one item has isDefault: true
  useEffect(() => {
    const defaultItemsCount = navigationItems.filter(item => item.isDefault === true).length;
    if (defaultItemsCount > 1) {
      console.warn(
        `Navigation: Multiple items with isDefault: true found (${defaultItemsCount}). Only one item should have isDefault: true.`
      );
    }
  }, [navigationItems]);

  // Calculate default index from items with isDefault: true, or fall back to defaultIndex prop
  const calculatedDefaultIndex = useMemo(() => {
    const defaultItemIndex = navigationItems.findIndex(item => item.isDefault === true);
    return defaultItemIndex >= 0 ? defaultItemIndex : defaultIndex;
  }, [navigationItems, defaultIndex]);

  const router = useRouter();
  const pathname = usePathname();
  const [activeIndex, setActiveIndex] = useState(calculatedDefaultIndex);
  // Always start with false to match server render, then update on client
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Check if mobile on mount and resize - only after hydration
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Mark as mounted to prevent hydration mismatch
    setMounted(true);

    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    // Check immediately
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sync activeIndex with URL pathname
  useEffect(() => {
    if (!mounted) return;
    const currentPath = pathname;
    const index = navigationItems.findIndex(item => {
      const itemPath = item.path || item.route;
      if (!itemPath) return false;
      // Exact match or pathname starts with item path (for nested routes)
      return currentPath === itemPath || currentPath.startsWith(itemPath + '/');
    });
    if (index >= 0 && index !== activeIndex) {
      setActiveIndex(index);
    }
  }, [mounted, pathname, navigationItems, activeIndex]);

  const navigateToIndex = (index) => {
    const maxIndex = navigationItems.length - 1;
    if (index >= 0 && index <= maxIndex) {
      const item = navigationItems[index];
      if (item?.path && mounted) {
        router.push(item.path, { scroll: false });
      }
    }
  };

  const handleItemClick = (index) => {
    const item = navigationItems[index];
    // Don't navigate if item is disabled
    if (item?.isDisabled) return;
    navigateToIndex(index);
  };

  // Use only the items array length (order of navigation items determines everything)
  const maxItems = navigationItems.length;

  // Check if current route has mobileFullscreen enabled
  const currentItem = navigationItems[activeIndex];
  const isMobileFullscreen = currentItem?.mobileFullscreen === true;

  // Find the home page index for the logo click handler
  // This should be the item with isDefault: true AND mobileOnly: true
  const homePageIndex = useMemo(() => {
    return navigationItems.findIndex(item => item.isDefault === true && item.mobileOnly === true);
  }, [navigationItems]);

  return (
    <>
      {/* Sidebar Navigation - Desktop */}
      {mounted && !isMobile && (
        <motion.aside
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="bg-white border-r border-gray-200 flex flex-col shadow-sm"
          style={{
            width: desktopWidth,
            height: desktopHeight === 'auto' ? 'auto' : desktopHeight,
          }}
        >
          <nav className="flex-1 overflow-y-auto p-2">
            {navigationItems.map((item, index) => {
              // Skip mobileOnly items in desktop sidebar
              if (item.mobileOnly) return null;
              const isDisabled = item.isDisabled === true;
              return (
                <motion.button
                  key={item.path || item.route || index}
                  onClick={() => handleItemClick(index)}
                  disabled={isDisabled}
                  className={`w-full text-left px-4 py-3 rounded-lg mb-1 transition-colors ${isDisabled
                    ? 'opacity-50 cursor-not-allowed text-gray-400'
                    : activeIndex === index
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  whileHover={isDisabled ? {} : { scale: 1.02 }}
                  whileTap={isDisabled ? {} : { scale: 0.98 }}
                >
                  <div className="flex items-center gap-3">
                    {item.iconActive && activeIndex === index && (
                      <div className="text-xl">{item.iconActive}</div>
                    )}
                    {item.iconInactive && activeIndex !== index && (
                      <div className="text-xl">{item.iconInactive}</div>
                    )}
                    {item.icon && !item.iconActive && !item.iconInactive && (
                      <div className="text-xl">{item.icon}</div>
                    )}
                    <span className="text-sm">{item.label}</span>
                  </div>
                </motion.button>
              );
            })}
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
            {navigationItems.map((item, index) => {
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
            <motion.div
              className="absolute bottom-0 h-1 bg-blue-600 rounded-t-full"
              layoutId="activeIndicator"
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              style={{
                width: `${100 / maxItems}%`,
                left: `${(activeIndex * 100) / maxItems}%`,
              }}
            />
          </div>
        </motion.nav>
      )}
    </>
  );
};

export default Navigation;

