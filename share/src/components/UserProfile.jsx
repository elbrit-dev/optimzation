'use client';

import { useAuth } from '@/contexts/AuthContext';
import LogoutButton from './LogoutButton';

export default function UserProfile({ showLogout = true }) {
  const { user } = useAuth();

  if (!user) return null;

  const displayName = user.displayName || user.email || 'User';
  const photoURL = user.photoURL;

  return (
    <div className="flex items-center gap-3">
      {photoURL && (
        <img
          src={photoURL}
          alt={displayName}
          className="w-8 h-8 rounded-full"
        />
      )}
      <div className="flex flex-col">
        <span className="text-sm font-medium text-gray-900">{displayName}</span>
        {user.email && (
          <span className="text-xs text-gray-500">{user.email}</span>
        )}
      </div>
      {showLogout && <LogoutButton className="ml-2" />}
    </div>
  );
}


