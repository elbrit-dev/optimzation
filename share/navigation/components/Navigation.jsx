'use client';

import React, { useState, useEffect, useRef, Children, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Swiper, SwiperSlide } from 'swiper/react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Image from 'next/image';

// Import Swiper styles
import 'swiper/css';

const Navigation = ({ children, items = [], defaultIndex = 0 }) => {
  // Convert children to array if needed
  const childrenArray = Children.toArray(children);

  // Create a mapping from pageKey to child component
  // Each navigation item should have a pageKey property that matches the child's key
  const pageMap = useMemo(() => {
    const map = new Map();
    // Use React.Children.map to access keys properly
    Children.map(children, (child, index) => {
      if (React.isValidElement(child)) {
        // React keys should be accessible via child.key
        const key = child.key || child.props?.pageKey;
        if (key) {
          map.set(String(key), child);
        }
      }
    });
    return map;
  }, [children]);

  // Validate that only one item has isDefault: true
  useEffect(() => {
    const defaultItemsCount = items.filter(item => item.isDefault === true).length;
    if (defaultItemsCount > 1) {
      console.warn(
        `Navigation: Multiple items with isDefault: true found (${defaultItemsCount}). Only one item should have isDefault: true.`
      );
    }
  }, [items]);

  // Calculate default index from items with isDefault: true, or fall back to defaultIndex prop
  const calculatedDefaultIndex = useMemo(() => {
    const defaultItemIndex = items.findIndex(item => item.isDefault === true);
    return defaultItemIndex >= 0 ? defaultItemIndex : defaultIndex;
  }, [items, defaultIndex]);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeIndex, setActiveIndex] = useState(calculatedDefaultIndex);
  // Always start with false to match server render, then update on client
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [direction, setDirection] = useState(1); // 1 for forward (right), -1 for backward (left)
  const containerRef = useRef(null);
  const swiperRef = useRef(null);

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

  // Sync activeIndex with URL query parameter on mount
  useEffect(() => {
    if (!mounted) return;
    const routeParam = searchParams.get('route');
    if (routeParam) {
      const normalizedParam = routeParam.toLowerCase().trim().replace(/\s+/g, '-');
      const index = items.findIndex(item => {
        const itemRoute = (item.route || item.path || item.label || '').toLowerCase().trim().replace(/\s+/g, '-');
        return itemRoute === normalizedParam;
      });
      if (index >= 0 && index !== activeIndex) {
        setActiveIndex(index);
      }
    }
  }, [mounted, searchParams, items]);

  // Sync Swiper with activeIndex changes (when navigating via buttons)
  useEffect(() => {
    if (!swiperRef.current || !mounted || !isMobile) return;
    if (swiperRef.current.activeIndex !== activeIndex) {
      swiperRef.current.slideTo(activeIndex);
    }
  }, [activeIndex, mounted, isMobile]);

  // Handle Swiper slide change
  const handleSlideChange = (swiper) => {
    const newIndex = swiper.activeIndex;
    if (newIndex !== activeIndex) {
      setDirection(newIndex > activeIndex ? 1 : -1);
      setActiveIndex(newIndex);

      // Update URL when swiping
      const item = items[newIndex];
      if (item && mounted) {
        const route = (item.route || item.path || item.label || '').toLowerCase().trim().replace(/\s+/g, '-');
        if (route) {
          const params = new URLSearchParams(searchParams.toString());
          params.set('route', route);
          router.push(`${pathname}?${params.toString()}`, { scroll: false });
        }
      }
    }
  };

  const navigateToIndex = (index) => {
    const maxIndex = items.length - 1;
    if (index >= 0 && index <= maxIndex) {
      // Determine direction: positive = forward (right), negative = backward (left)
      setDirection(index > activeIndex ? 1 : -1);
      setActiveIndex(index);

      // Update URL with route parameter
      const item = items[index];
      if (item && mounted) {
        const route = (item.route || item.path || item.label || '').toLowerCase().trim().replace(/\s+/g, '-');
        if (route) {
          const params = new URLSearchParams(searchParams.toString());
          params.set('route', route);
          router.push(`${pathname}?${params.toString()}`, { scroll: false });
        }
      }
      // Swiper will be updated by useEffect
      if (swiperRef.current && mounted && isMobile) {
        swiperRef.current.slideTo(index);
      }
    }
  };

  const handleItemClick = (index) => {
    navigateToIndex(index);
  };

  // Use only the items array length (order of navigation items determines everything)
  const maxItems = items.length;

  // Check if current route has mobileFullscreen enabled
  const currentItem = items[activeIndex];
  const isMobileFullscreen = currentItem?.mobileFullscreen === true;

  // Find the home page index for the logo click handler
  // This should be the item with isDefault: true AND mobileOnly: true
  const homePageIndex = useMemo(() => {
    return items.findIndex(item => item.isDefault === true && item.mobileOnly === true);
  }, [items]);

  // Get the active page based on the active navigation item's pageKey
  const activePage = useMemo(() => {
    if (currentItem) {
      const pageKey = currentItem.pageKey || currentItem.route || currentItem.path;
      if (pageKey) {
        return pageMap.get(String(pageKey));
      }
    }
    return null;
  }, [currentItem, pageMap]);

  // Get ordered pages based on navigation items order (for mobile Swiper)
  // This maintains the exact order of items array, with null for missing pages
  const orderedPages = useMemo(() => {
    return items.map((item) => {
      const pageKey = item.pageKey || item.route || item.path;
      if (pageKey) {
        return pageMap.get(String(pageKey)) || null;
      }
      return null;
    });
  }, [items, pageMap]);

  return (
    <div className="flex h-full bg-gray-50 overflow-hidden">
      {/* Sidebar Navigation - Desktop */}
      {mounted && !isMobile && (
        <motion.aside
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm"
        >
          <motion.button
            onClick={() => {
              if (homePageIndex >= 0) {
                handleItemClick(homePageIndex);
              }
            }}
            className="w-full p-4 border-b border-gray-200 hover:bg-gray-50 transition-colors"
            whileHover={{ backgroundColor: '#f9fafb' }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex items-center gap-3">
              <Image src="/logo.jpeg" width={40} height={40} alt="Elbrit" className="rounded" />
              <span className="text-lg font-semibold text-gray-900">Elbrit</span>
            </div>
          </motion.button>
          <nav className="flex-1 overflow-y-auto p-2">
            {items.map((item, index) => {
              // Skip mobileOnly items in desktop sidebar
              if (item.mobileOnly) return null;
              return (
                <motion.button
                  key={item.path || item.route || index}
                  onClick={() => handleItemClick(index)}
                  className={`w-full text-left px-4 py-3 rounded-lg mb-1 transition-colors ${activeIndex === index
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
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

      {/* Main Content Area */}
      <div
        ref={containerRef}
        className="flex-1 flex flex-col overflow-hidden relative min-h-0"
      >
        <div className="flex-1 overflow-hidden relative min-h-0">
          {mounted && isMobile ? (
            // Mobile: Use Swiper for smooth swipe gestures with better control
            <Swiper
              onSwiper={(swiper) => {
                swiperRef.current = swiper;
                // Set initial slide based on calculated default index
                if (calculatedDefaultIndex !== 0) {
                  swiper.slideTo(calculatedDefaultIndex, 0);
                }
              }}
              onSlideChange={handleSlideChange}
              spaceBetween={0}
              slidesPerView={1}
              resistance={true}
              resistanceRatio={0.15}
              touchRatio={1.2}
              threshold={3}
              speed={300}
              allowTouchMove={true}
              followFinger={true}
              watchSlidesProgress={true}
              className="h-full"
              style={{ height: '100%' }}
            >
              {orderedPages.map((page, index) => {
                const item = items[index];
                const pageKey = item?.pageKey || item?.route || item?.path || index;
                return (
                  <SwiperSlide key={pageKey} className="h-full overflow-y-auto pb-16">
                    {page || (
                      <div className="h-full flex items-center justify-center p-8">
                        <div className="text-center">
                          <p className="text-gray-500">No content available for this page</p>
                        </div>
                      </div>
                    )}
                  </SwiperSlide>
                );
              })}
            </Swiper>
          ) : (
            // Desktop: Show only active page with animation
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeIndex}
                initial={{
                  opacity: 0,
                  x: direction > 0 ? 100 : -100
                }}
                animate={{ opacity: 1, x: 0 }}
                exit={{
                  opacity: 0,
                  x: direction > 0 ? -100 : 100
                }}
                transition={{
                  type: 'spring',
                  stiffness: 300,
                  damping: 30,
                }}
                className="h-full overflow-y-auto"
              >
                {activePage ? (
                  <div className="h-full">
                    {activePage}
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center p-8">
                    <div className="text-center">
                      <p className="text-gray-500">No content available for this page</p>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* Bottom Navigation - Mobile */}
        {mounted && isMobile && maxItems > 0 && !isMobileFullscreen && (
          <motion.nav
            initial={false}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white border-t border-gray-200 shadow-lg safe-area-bottom flex-shrink-0 z-10 fixed bottom-0 left-0 right-0"
          >
            <div className="flex justify-around items-center h-16 px-2 relative">
              {items.map((item, index) => (
                <motion.button
                  key={item.path || item.route || index}
                  onClick={() => handleItemClick(index)}
                  className={`relative flex flex-col items-center justify-center flex-1 h-full rounded-lg transition-colors ${activeIndex === index
                    ? 'text-blue-600'
                    : 'text-gray-500'
                    }`}
                  whileTap={{ scale: 0.9 }}
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
              ))}
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
      </div>
    </div>
  );
};

export default Navigation;

