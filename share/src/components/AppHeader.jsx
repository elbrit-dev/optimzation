'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Menubar } from 'primereact/menubar';
import { NAV_CURRENT_CLASS } from '@/design-system/primereact/menubarPreset';
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

  /* Everything that isn't one of the four primary data surfaces lives under
     one "Other Components" dropdown instead of as three more top-level items
     -- a menubar that wide wraps to a second row on anything narrower than a
     desktop monitor, and it buries Data Table / Report Table / GraphQL /
     Tokens (what people are actually here for) behind the same visual weight
     as a nav demo page and a timeline demo. */
  const otherItems = [
    {
      label: 'Dev harness',
      icon: 'pi pi-sliders-h',
      url: '/dev/harness',
      command: () => {
        router.push('/dev/harness');
      }
    },
    {
      label: 'Visit',
      icon: 'pi pi-map-marker',
      url: '/visit',
      command: () => {
        router.push('/visit');
      }
    },
    {
      label: 'Secondary Entry',
      icon: 'pi pi-box',
      url: '/dev/secondary-entry',
      command: () => {
        router.push('/dev/secondary-entry');
      }
    },
    {
      label: 'Secondary Approval',
      icon: 'pi pi-check-square',
      url: '/dev/secondary-approval',
      command: () => {
        router.push('/dev/secondary-approval');
      }
    },
    {
      label: 'Navigation',
      icon: 'pi pi-bars',
      url: '/navigation',
      command: () => {
        router.push('/navigation');
      }
    },
    {
      label: 'Event Timeline',
      icon: 'pi pi-clock',
      url: '/timeline',
      command: () => {
        router.push('/timeline');
      }
    },
    {
      label: 'Ring Nav',
      icon: 'pi pi-circle',
      url: '/ring-nav',
      command: () => {
        router.push('/ring-nav');
      }
    }
  ];

  /* `p-menuitem-active` was a LARA class name applied by our own code as
     application state. Renamed to a design-system name, which the Menubar
     preset matches on -- see NAV_CURRENT_CLASS.

     Only ever set on a LEAF (an item with a `url`), never on "Other
     Components" itself, even when the current route is one of its children.
     The preset's active styling (`[.ds-nav-current_&]:bg-info-wash`) is a
     Tailwind ANCESTOR variant -- it paints every `action` element nested
     inside the marked `<li>`, not just its own. Marking the group would light
     up every item in the dropdown at once, not just the current one. */
  const markActive = (item) => {
    const items = item.items?.map(markActive);
    const isActive = item.url === pathname;
    return { ...item, items, className: isActive ? NAV_CURRENT_CLASS : '' };
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
      label: 'Report Table',
      icon: 'pi pi-file-excel',
      url: '/report-table',
      command: () => {
        router.push('/report-table');
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
      label: 'Global Tokens',
      icon: 'pi pi-key',
      url: '/tokens',
      command: () => {
        router.push('/tokens');
      }
    },
    {
      label: 'Other Components',
      icon: 'pi pi-ellipsis-h',
      items: otherItems
    }
  ].map(markActive);

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
        <h1 className="text-lg sm:text-xl font-semibold text-body m-0 p-0 leading-tight">ELBRIT</h1>
        <p className="text-xs text-ds-secondary m-0 p-0 leading-tight">Component Dashboard</p>
      </div>
    </div>
  );

  const end = user ? (
    <div className="flex items-center gap-4">
      {user.email && (
        <span className="text-sm text-body">{user.email}</span>
      )}
      <button
        onClick={handleSignOut}
        disabled={loading}
        className="px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger-wash rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        <i className="pi pi-sign-out text-sm"></i>
        {loading ? 'Signing out...' : 'Sign Out'}
      </button>
    </div>
  ) : null;

  return (
    <div className="app-header-container">
      <Menubar
        /* Styling comes from the global registry
           (design-system/primereact/registry.js); this only opts out of the
           lara theme. `app-header-menubar` is gone with the CSS block it
           existed to scope. */
        unstyled
        model={navigationItems}
        start={start}
        end={end}
      />
    </div>
  );
}

