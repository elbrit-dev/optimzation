'use client';

import Navigation from '../navigation/components/Navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';

export default function NavigationLayout({ children }) {
  // Get swipe handlers from hook (navigationItems are set by Navigation component)
  const swipeHandlers = useSwipeNavigation();

  return (
    <ProtectedRoute>
      <div className="h-dvh flex bg-gray-50 overflow-hidden overflow-x-hidden">
        <Navigation />
        <div className="flex-1 overflow-y-auto" {...(swipeHandlers || {})}>
          {children}
        </div>
      </div>
    </ProtectedRoute>
  );
}
