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
  desktopHeight = '93dvh', // Default: auto (flex-1)
  mobileWidth = '100%', // Default: full width
  mobileHeight = '4rem', // Default: h-16
  showCollapse = true // Default: true
}) => {
  // Debug: Component initialization
  console.log('[Navigation] Component initialized with props:', {
    itemsProvided: !!items,
    itemsCount: items?.length || DEFAULT_NAVIGATION_ITEMS.length,
    defaultIndex,
    desktopWidth,
    desktopHeight,
    mobileWidth,
    mobileHeight
  });

  // Use provided items or default items
  const navigationItems = items || DEFAULT_NAVIGATION_ITEMS;

  // Debug: Navigation items validation
  console.log('[Navigation] Navigation items:', {
    totalItems: navigationItems.length,
    items: navigationItems.map((item, idx) => ({
      index: idx,
      label: item.label || 'No label',
      path: item.path || item.route || 'No path',
      mobileOnly: item.mobileOnly || false,
      mobileFullscreen: item.mobileFullscreen || false,
      isDefault: item.isDefault || false,
      isDisabled: item.isDisabled || false,
      hasIconActive: !!item.iconActive,
      hasIconInactive: !!item.iconInactive,
      hasIcon: !!item.icon
    }))
  });

  // Initialize swipe navigation hook with navigationItems
  useSwipeNavigation(navigationItems);

  // Validate that only one item has isDefault: true
  useEffect(() => {
    const defaultItemsCount = navigationItems.filter(item => item.isDefault === true).length;
    console.log('[Navigation] Validating default items:', {
      defaultItemsCount,
      defaultItems: navigationItems
        .map((item, idx) => ({ index: idx, label: item.label, isDefault: item.isDefault }))
        .filter(item => item.isDefault)
    });
    if (defaultItemsCount > 1) {
      console.warn(
        `[Navigation] Multiple items with isDefault: true found (${defaultItemsCount}). Only one item should have isDefault: true.`
      );
    } else if (defaultItemsCount === 0) {
      console.log('[Navigation] No items with isDefault: true found, will use defaultIndex prop');
    }
  }, [navigationItems]);

  // Calculate default index from items with isDefault: true, or fall back to defaultIndex prop
  const calculatedDefaultIndex = useMemo(() => {
    const defaultItemIndex = navigationItems.findIndex(item => item.isDefault === true);
    const result = defaultItemIndex >= 0 ? defaultItemIndex : defaultIndex;
    console.log('[Navigation] Calculated default index:', {
      defaultItemIndex,
      defaultIndexProp: defaultIndex,
      calculatedIndex: result,
      itemAtCalculatedIndex: navigationItems[result] ? {
        label: navigationItems[result].label,
        path: navigationItems[result].path || navigationItems[result].route
      } : null
    });
    return result;
  }, [navigationItems, defaultIndex]);

  const router = useRouter();
  const pathname = usePathname();
  const [activeIndex, setActiveIndex] = useState(null);
  // Always start with false to match server render, then update on client
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Debug: Initial state
  console.log('[Navigation] Initial state:', {
    activeIndex,
    isMobile,
    mounted,
    pathname,
    calculatedDefaultIndex
  });

  // Check if mobile on mount and resize - only after hydration
  useEffect(() => {
    if (typeof window === 'undefined') {
      console.log('[Navigation] Server-side render, skipping mobile detection');
      return;
    }

    // Mark as mounted to prevent hydration mismatch
    setMounted(true);
    console.log('[Navigation] Component mounted on client');

    const checkMobile = () => {
      const windowWidth = window.innerWidth;
      const isMobileNow = windowWidth < 1024;
      console.log('[Navigation] Mobile detection check:', {
        windowWidth,
        isMobile: isMobileNow,
        breakpoint: 1024
      });
      setIsMobile(isMobileNow);
    };
    // Check immediately
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => {
      console.log('[Navigation] Cleaning up resize listener');
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // Sync activeIndex with URL pathname
  useEffect(() => {
    if (!mounted) {
      console.log('[Navigation] Pathname sync skipped (not mounted yet)');
      return;
    }
    const currentPath = pathname;
    console.log('[Navigation] Pathname changed, syncing activeIndex:', {
      currentPath,
      currentActiveIndex: activeIndex
    });

    const index = navigationItems.findIndex(item => {
      const itemPath = item.path || item.route;
      if (!itemPath) {
        console.log('[Navigation] Item has no path/route:', item);
        return false;
      }
      // Exact match or pathname starts with item path (for nested routes)
      const matches = currentPath === itemPath || currentPath.startsWith(itemPath + '/');
      if (matches) {
        console.log('[Navigation] Path match found:', {
          itemIndex: navigationItems.indexOf(item),
          itemPath,
          currentPath,
          matchType: currentPath === itemPath ? 'exact' : 'nested'
        });
      }
      return matches;
    });

    if (index >= 0 && index !== activeIndex) {
      console.log('[Navigation] Updating activeIndex from pathname:', {
        oldIndex: activeIndex,
        newIndex: index,
        item: {
          label: navigationItems[index].label,
          path: navigationItems[index].path || navigationItems[index].route
        }
      });
      setActiveIndex(index);
    } else if (index < 0) {
      console.warn('[Navigation] No matching navigation item found for pathname:', {
        pathname: currentPath,
        availablePaths: navigationItems.map(item => item.path || item.route).filter(Boolean)
      });
      setActiveIndex(null);
    } else {
      console.log('[Navigation] ActiveIndex already matches pathname:', {
        index,
        activeIndex
      });
    }
  }, [mounted, pathname, navigationItems, activeIndex]);

  const navigateToIndex = (index) => {
    const maxIndex = navigationItems.length - 1;
    console.log('[Navigation] navigateToIndex called:', {
      requestedIndex: index,
      maxIndex,
      isValid: index >= 0 && index <= maxIndex
    });

    if (index >= 0 && index <= maxIndex) {
      const item = navigationItems[index];
      console.log('[Navigation] Navigation item at index:', {
        index,
        item: {
          label: item?.label,
          path: item?.path || item?.route,
          mobileOnly: item?.mobileOnly,
          mobileFullscreen: item?.mobileFullscreen,
          isDisabled: item?.isDisabled
        },
        hasPath: !!item?.path,
        mounted
      });

      if (item?.path && mounted) {
        console.log('[Navigation] Navigating to path:', {
          path: item.path,
          index,
          scroll: false
        });
        router.push(item.path, { scroll: false });
      } else if (!item?.path) {
        console.warn('[Navigation] Cannot navigate: item has no path:', {
          index,
          item
        });
      } else if (!mounted) {
        console.warn('[Navigation] Cannot navigate: component not mounted yet');
      }
    } else {
      console.error('[Navigation] Invalid index for navigation:', {
        index,
        maxIndex,
        validRange: `0-${maxIndex}`
      });
    }
  };

  const handleItemClick = (index) => {
    const item = navigationItems[index];
    console.log('[Navigation] Item clicked:', {
      index,
      item: {
        label: item?.label,
        path: item?.path || item?.route,
        isDisabled: item?.isDisabled
      }
    });

    // Don't navigate if item is disabled
    if (item?.isDisabled) {
      console.log('[Navigation] Navigation blocked: item is disabled', {
        index,
        item
      });
      return;
    }
    navigateToIndex(index);
  };

  // Use only the items array length (order of navigation items determines everything)
  const maxItems = navigationItems.length;

  // Check if current route has mobileFullscreen enabled
  const currentItem = activeIndex !== null ? navigationItems[activeIndex] : null;
  const isMobileFullscreen = activeIndex !== null && currentItem?.mobileFullscreen === true;

  // Debug: Current state and rendering decisions
  console.log('[Navigation] Rendering state:', {
    mounted,
    isMobile,
    activeIndex,
    maxItems,
    currentItem: currentItem ? {
      label: currentItem.label,
      path: currentItem.path || currentItem.route,
      mobileFullscreen: currentItem.mobileFullscreen,
      mobileOnly: currentItem.mobileOnly
    } : null,
    isMobileFullscreen,
    willShowDesktop: mounted && !isMobile,
    willShowMobile: mounted && isMobile && maxItems > 0 && !isMobileFullscreen
  });

  // Find the home page index for the logo click handler
  // This should be the item with isDefault: true AND mobileOnly: true
  const homePageIndex = useMemo(() => {
    const index = navigationItems.findIndex(item => item.isDefault === true && item.mobileOnly === true);
    console.log('[Navigation] Home page index calculated:', {
      homePageIndex: index,
      found: index >= 0
    });
    return index;
  }, [navigationItems]);

  // Debug: Active indicator position for mobile
  useEffect(() => {
    if (mounted && isMobile && maxItems > 0 && !isMobileFullscreen) {
      console.log('[Navigation] Mobile active indicator position:', {
        activeIndex,
        maxItems,
        widthPercent: `${100 / maxItems}%`,
        leftPercent: `${(activeIndex * 100) / maxItems}%`
      });
    }
  }, [mounted, isMobile, maxItems, isMobileFullscreen, activeIndex]);

  // Debug: Log when navigation is hidden
  useEffect(() => {
    if (mounted) {
      if (isMobile && isMobileFullscreen) {
        console.log('[Navigation] Mobile navigation hidden due to mobileFullscreen:', {
          currentItem: {
            label: currentItem?.label,
            path: currentItem?.path || currentItem?.route,
            mobileFullscreen: currentItem?.mobileFullscreen
          }
        });
      } else if (!mounted) {
        console.log('[Navigation] Navigation hidden: component not mounted');
      }
    }
  }, [mounted, isMobile, isMobileFullscreen, currentItem]);

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
              {navigationItems.map((item, index) => {
                // Skip mobileOnly items in desktop sidebar
                if (item.mobileOnly) {
                  console.log('[Navigation] Skipping mobileOnly item in desktop sidebar:', {
                    index,
                    label: item.label,
                    path: item.path || item.route
                  });
                  return null;
                }
                const isDisabled = item.isDisabled === true;
                const isActive = activeIndex === index;
                console.log('[Navigation] Rendering desktop navigation item:', {
                  index,
                  label: item.label,
                  path: item.path || item.route,
                  isActive,
                  isDisabled,
                  hasIconActive: !!item.iconActive,
                  hasIconInactive: !!item.iconInactive,
                  hasIcon: !!item.icon
                });

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
            {navigationItems.map((item, index) => {
              const isDisabled = item.isDisabled === true;
              const isActive = activeIndex === index;
              console.log('[Navigation] Rendering mobile navigation item:', {
                index,
                label: item.label,
                path: item.path || item.route,
                isActive,
                isDisabled,
                hasIconActive: !!item.iconActive,
                hasIconInactive: !!item.iconInactive,
                hasIcon: !!item.icon
              });

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

