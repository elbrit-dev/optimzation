'use client';

import { useState, useEffect, useRef, Children } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Swiper, SwiperSlide } from 'swiper/react';

// Import Swiper styles
import 'swiper/css';

const Navigation = ({ children, items = [], defaultIndex = 0 }) => {
  // Convert children to array if needed
  const childrenArray = Children.toArray(children);
  const [activeIndex, setActiveIndex] = useState(defaultIndex);
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
    }
  };

  const navigateToIndex = (index) => {
    const maxIndex = Math.max(items.length, childrenArray.length) - 1;
    if (index >= 0 && index <= maxIndex) {
      // Determine direction: positive = forward (right), negative = backward (left)
      setDirection(index > activeIndex ? 1 : -1);
      setActiveIndex(index);
      // Swiper will be updated by useEffect
      if (swiperRef.current && mounted && isMobile) {
        swiperRef.current.slideTo(index);
      }
    }
  };

  const handleItemClick = (index) => {
    navigateToIndex(index);
  };

  // Use the length of children array or items array, whichever is larger
  const maxItems = Math.max(items.length, childrenArray.length);

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
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Navigation</h2>
          </div>
          <nav className="flex-1 overflow-y-auto p-2">
            {items.map((item, index) => (
              <motion.button
                key={item.path || index}
                onClick={() => handleItemClick(index)}
                className={`w-full text-left px-4 py-3 rounded-lg mb-1 transition-colors ${
                  activeIndex === index
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center gap-3">
                  {item.icon && <i className={`${item.icon} text-xl`}></i>}
                  <span className="text-sm">{item.label}</span>
                </div>
              </motion.button>
            ))}
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
                // Set initial slide
                if (defaultIndex !== 0) {
                  swiper.slideTo(defaultIndex, 0);
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
              {childrenArray.map((child, index) => (
                <SwiperSlide key={index} className="h-full overflow-y-auto">
                  {child}
                </SwiperSlide>
              ))}
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
                {childrenArray[activeIndex] ? (
                  <div className="h-full">
                    {childrenArray[activeIndex]}
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
        {mounted && isMobile && maxItems > 0 && (
          <motion.nav
            initial={false}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white border-t border-gray-200 shadow-lg safe-area-bottom flex-shrink-0 z-10"
            style={{ position: 'relative' }}
          >
            <div className="flex justify-around items-center h-16 px-2 relative">
              {items.map((item, index) => (
                <motion.button
                  key={item.path || index}
                  onClick={() => handleItemClick(index)}
                  className={`relative flex flex-col items-center justify-center flex-1 h-full rounded-lg transition-colors ${
                    activeIndex === index
                      ? 'text-blue-600'
                      : 'text-gray-500'
                  }`}
                  whileTap={{ scale: 0.9 }}
                >
                  {item.icon && (
                    <motion.i
                      className={`${item.icon} text-2xl mb-1`}
                      animate={{
                        scale: activeIndex === index ? 1.1 : 1,
                      }}
                      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                    />
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

