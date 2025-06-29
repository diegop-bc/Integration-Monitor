import { useQuery } from '@tanstack/react-query';
import { groupService } from '../../services/groupService';
import { getPublicGroupFeedItems } from '../../services/feedService';
import { sanitizeAndTruncate } from '../../utils/textSanitizer';
import { PublicGroupStats } from './PublicGroupStats';
import { JoinGroupButton } from './JoinGroupButton';
import type { PublicGroup, PublicGroupFeedsResponse } from '../../types/group';
import type { FeedItem } from '../../types/feed';

interface PublicGroupViewProps {
  group: PublicGroup;
}

export function PublicGroupView({ group }: PublicGroupViewProps) {
  console.log('🏠 [DEBUG] PublicGroupView rendered with group:', {
    groupId: group.id,
    groupName: group.name,
    isPublic: group.is_public
  });

  // Fetch public group feeds
  const { data: feedsData, isLoading: feedsLoading } = useQuery({
    queryKey: ['publicGroupFeeds', group.id],
    queryFn: () => groupService.getPublicGroupFeeds(group.id),
  });

  // Fetch recent feed items for public group using the specific function
  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['publicGroupItems', group.id],
    queryFn: () => {
      console.log('🔄 [DEBUG] Fetching public group items for:', group.id);
      return getPublicGroupFeedItems(group.id);
    },
  });

  console.log('📋 [DEBUG] Query states:', {
    feedsLoading,
    itemsLoading,
    feedsCount: feedsData?.length || 0,
    itemsCount: itemsData?.items?.length || 0,
    itemsError: itemsData?.error
  });

  const feeds = feedsData || [];
  const recentItems = itemsData?.items?.slice(0, 8) || [];

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getIntegrationColor = (integrationName: string) => {
    const colors = [
      { bg: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', text: 'white', accent: '#3b82f6' },
      { bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', text: 'white', accent: '#10b981' },
      { bg: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', text: 'white', accent: '#8b5cf6' },
      { bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', text: 'white', accent: '#f59e0b' },
      { bg: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)', text: 'white', accent: '#ec4899' },
      { bg: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', text: 'white', accent: '#6366f1' },
      { bg: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', text: 'white', accent: '#ef4444' },
      { bg: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)', text: 'white', accent: '#eab308' },
    ];
    
    const hash = integrationName.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    
    return colors[Math.abs(hash) % colors.length];
  };

  const getTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="min-h-screen gradient-bg">
      {/* Public Group Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-blue-700">
                  {group.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold text-gray-900">{group.name}</h1>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                    Public Group
                  </span>
                </div>
                {group.description && (
                  <p className="text-gray-600 mt-1">{group.description}</p>
                )}
                <div className="flex items-center space-x-4 mt-2">
                  <span className="text-sm text-gray-500">
                    Created {formatDate(group.created_at)}
                  </span>
                  <span className="text-sm text-gray-500">
                    Last activity {formatDate(group.last_activity)}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Join Button or Member Status */}
            {group.user_role === 'none' ? (
              <JoinGroupButton group={group} />
            ) : (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                  You are a {group.user_role}
                </span>
              </div>
            )}
          </div>

          {/* Stats Cards */}
          <div className="mt-6">
            <PublicGroupStats group={group} />
          </div>
        </div>
      </div>

      {/* Group Integrations Section */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">
            Public Integrations ({feeds.length})
          </h2>

          {feedsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-gray-200 rounded-xl h-24 animate-pulse"></div>
              ))}
            </div>
          ) : feeds.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border-2 border-dashed border-gray-300">
              <svg className="icon-xl text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No integrations yet</h3>
              <p className="text-gray-500">This group hasn't added any integrations yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {feeds.map((feed: PublicGroupFeedsResponse) => {
                const colorScheme = getIntegrationColor(feed.integration_name);
                
                return (
                  <div
                    key={feed.id}
                    className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:shadow-md transition-all duration-200"
                  >
                    <div className="text-center">
                      <div 
                        style={{ 
                          width: '3rem', 
                          height: '3rem', 
                          background: colorScheme.bg,
                          borderRadius: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: colorScheme.text,
                          fontWeight: 'bold',
                          fontSize: '1.125rem',
                          margin: '0 auto 0.75rem'
                        }}
                      >
                        {(feed.integration_alias || feed.integration_name).charAt(0).toUpperCase()}
                      </div>
                      
                      <h3 className="font-medium text-gray-900 text-sm mb-1 truncate">
                        {feed.integration_name}
                      </h3>
                      {feed.integration_alias && (
                        <p className="text-xs text-gray-500 truncate">
                          {feed.integration_alias}
                        </p>
                      )}
                      <div className="mt-2 text-xs text-gray-400">
                        {feed.recent_items_count} recent items
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Updates Section */}
        <div className="mt-8">
          <h2 className="text-2xl font-bold text-white mb-6">Recent Updates</h2>

          {itemsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-white/10 rounded-xl h-48 animate-pulse"></div>
              ))}
            </div>
          ) : recentItems.length === 0 ? (
            <div className="text-center py-16">
              <svg className="icon-xl text-white/50 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
              <h3 className="text-xl font-semibold text-white mb-2">No updates yet</h3>
              <p className="text-blue-200">This group hasn't received any updates yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {recentItems.map((item: FeedItem) => {
                const colorScheme = getIntegrationColor(item.integrationName);
                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group"
                    onClick={() => window.open(item.link, '_blank')}
                  >
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-4">
                      <div 
                        style={{ 
                          width: '2rem', 
                          height: '2rem', 
                          background: colorScheme.bg,
                          borderRadius: '0.5rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: colorScheme.text,
                          fontWeight: 'bold',
                          fontSize: '0.875rem'
                        }}
                      >
                        {(item.integrationAlias || item.integrationName).charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {item.integrationAlias || item.integrationName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {getTimeAgo(item.pubDate)}
                        </p>
                      </div>
                    </div>

                    {/* Content */}
                    <h3 className="font-medium text-gray-900 mb-2 line-clamp-2 text-sm leading-tight">
                      {item.title}
                    </h3>
                    
                    {item.contentSnippet && (
                      <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed">
                        {sanitizeAndTruncate(item.contentSnippet, 120)}
                      </p>
                    )}

                    {/* Footer */}
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">
                          {new Date(item.pubDate).toLocaleDateString()}
                        </span>
                        <svg className="icon-sm text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 