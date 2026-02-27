'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Menubar } from 'primereact/menubar';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';

export default function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);

  // Don't show header on login page
  if (pathname === '/login' || !isAuthenticated) {
    return null;
  }

  const handleSignOut = async () => {
    setLoading(true);
    const result = await signOut();
    if (result.success) {
      router.push('/login');
    }
    setLoading(false);
  };

  const navigationItems = [
    {
      label: 'Data Table',
      icon: 'pi pi-table',
      url: '/datatable',
      command: () => {
        router.push('/datatable');
      }
    },
    {
      label: 'GraphQL Playground',
      icon: 'pi pi-code',
      url: '/graphql-playground-v2',
      command: () => {
        router.push('/graphql-playground-v2');
      }
    },
    {
      label: 'Navigation',
      icon: 'pi pi-bars',
      url: '/navigation',
      command: () => {
        router.push('/navigation');
      }
    }
  ].map(item => ({
    ...item,
    className: pathname === item.url ? 'p-menuitem-active' : ''
  }));

  const handleLogoClick = () => {
    router.push('/');
  };

  const start = (
    <div 
      className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity" 
      onClick={handleLogoClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleLogoClick();
        }
      }}
      aria-label="Go to home page"
    >
      <img 
        src="/elbrit.jpeg" 
        alt="ELBRIT" 
        className="h-8 w-8 sm:h-10 sm:w-10 object-contain"
      />
      <div className="hidden sm:block">
        <h1 className="text-lg sm:text-xl font-semibold text-gray-900 m-0 p-0 leading-tight">ELBRIT</h1>
        <p className="text-xs text-gray-600 m-0 p-0 leading-tight">Component Dashboard</p>
      </div>
    </div>
  );

  const end = user ? (
    <div className="flex items-center gap-4">
      {user.email && (
        <span className="text-sm text-gray-700">{user.email}</span>
      )}
      <button
        onClick={handleSignOut}
        disabled={loading}
        className="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        <i className="pi pi-sign-out text-sm"></i>
        {loading ? 'Signing out...' : 'Sign Out'}
      </button>
    </div>
  ) : null;

  return (
    <div className="app-header-container">
      <Menubar 
        model={navigationItems} 
        start={start}
        end={end}
        className="app-header-menubar"
      />
    </div>
  );
}

