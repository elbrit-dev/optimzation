'use client';

import Navigation from './components/Navigation';
import ProtectedRoute from '@/components/ProtectedRoute';

function NavigationPlayground() {
  return (
    <div className="h-dvh flex flex-col">
      <div className="flex-1 overflow-hidden">
        <Navigation />
      </div>
    </div>
  );
}

export default function NavigationPlaygroundPage() {
  return (
    <ProtectedRoute>
      <NavigationPlayground />
    </ProtectedRoute>
  );
}
