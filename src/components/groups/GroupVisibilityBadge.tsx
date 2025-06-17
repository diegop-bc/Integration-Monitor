import React from 'react';
import type { GroupWithMembership } from '../../types/group';

interface GroupVisibilityBadgeProps {
  group: GroupWithMembership;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export function GroupVisibilityBadge({ 
  group, 
  size = 'md', 
  showLabel = true, 
  className = '' 
}: GroupVisibilityBadgeProps) {
  const isPublic = group.is_public;

  // Size configurations
  const sizeConfig = {
    sm: {
      badge: 'px-2 py-0.5 text-xs',
      icon: 'w-3 h-3',
      text: 'text-xs'
    },
    md: {
      badge: 'px-2.5 py-0.5 text-xs',
      icon: 'w-4 h-4',
      text: 'text-sm'
    },
    lg: {
      badge: 'px-3 py-1 text-sm',
      icon: 'w-5 h-5',
      text: 'text-base'
    }
  };

  const config = sizeConfig[size];

  if (isPublic) {
    return (
      <div className={`inline-flex items-center gap-1 bg-green-100 text-green-800 font-medium rounded-full border border-green-200 ${config.badge} ${className}`}>
        <svg className={`${config.icon} flex-shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {showLabel && <span>Public</span>}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1 bg-gray-100 text-gray-700 font-medium rounded-full border border-gray-200 ${config.badge} ${className}`}>
      <svg className={`${config.icon} flex-shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
      {showLabel && <span>Private</span>}
    </div>
  );
}

interface GroupVisibilityIconProps {
  isPublic: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function GroupVisibilityIcon({ isPublic, size = 'md', className = '' }: GroupVisibilityIconProps) {
  const sizeConfig = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  const iconSize = sizeConfig[size];

  if (isPublic) {
    return (
      <svg 
        className={`${iconSize} text-green-600 ${className}`} 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }

  return (
    <svg 
      className={`${iconSize} text-gray-500 ${className}`} 
      fill="none" 
      stroke="currentColor" 
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
} 