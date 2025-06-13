import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useGroup } from '../../contexts/GroupContext';
import { getAllFeedItems } from '../../services/feedService';
import { useFeedUpdates, usePaginatedFeedItems, useIntegrations } from '../../hooks/useFeedUpdates';
import FeedItemCard from './FeedItemCard';
import type { FeedItem } from '../../types/feed';
import { useState } from 'react';

const UnifiedFeed = () => {
  const { user } = useAuth();
  const { currentGroup } = useGroup();
  const params = useParams();
  const [selectedIntegration, setSelectedIntegration] = useState<string>('all');
  
  // Determine context from URL
  const isGroupMode = !!params.groupId;
  const groupId = params.groupId || null;
  const contextId = isGroupMode ? groupId : null; // null for personal, groupId for group
  
  // Get available integrations for filter with context
  const { integrations } = useIntegrations(contextId);
  
  // Use paginated feed items hook with filter and context
  const { items, loadMore, hasMore, isLoadingMore, totalCount, reset } = usePaginatedFeedItems(
    20, 
    selectedIntegration === 'all' ? undefined : selectedIntegration,
    contextId
  );
  
  // Initial query for loading state and error handling with context
  const { isLoading, error, refetch } = useQuery({
    queryKey: ['allFeedItems', user?.id, contextId],
    queryFn: () => getAllFeedItems(contextId),
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  // Listen for new updates across all feeds
  const { newItems } = useFeedUpdates();

  const handleRefresh = () => {
    reset();
    refetch();
    // Load first page again
    setTimeout(() => loadMore(), 100);
  };

  const handleLoadMore = () => {
    loadMore();
  };

  const handleFilterChange = (integration: string) => {
    setSelectedIntegration(integration);
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
    
    const diffInWeeks = Math.floor(diffInDays / 7);
    if (diffInWeeks < 4) return `${diffInWeeks}w ago`;
    
    const diffInMonths = Math.floor(diffInDays / 30);
    return `${diffInMonths}mo ago`;
  };

  const getIntegrationColor = (integrationName: string) => {
    // Generate consistent colors based on integration name
    const colors = [
      { bg: 'linear-gradient(to right, #3b82f6, #1d4ed8)', text: 'white' },
      { bg: 'linear-gradient(to right, #10b981, #059669)', text: 'white' },
      { bg: 'linear-gradient(to right, #8b5cf6, #7c3aed)', text: 'white' },
      { bg: 'linear-gradient(to right, #f59e0b, #d97706)', text: 'white' },
      { bg: 'linear-gradient(to right, #ec4899, #db2777)', text: 'white' },
      { bg: 'linear-gradient(to right, #6366f1, #4f46e5)', text: 'white' },
      { bg: 'linear-gradient(to right, #ef4444, #dc2626)', text: 'white' },
      { bg: 'linear-gradient(to right, #eab308, #ca8a04)', text: 'white' },
    ];
    
    const hash = integrationName.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    
    return colors[Math.abs(hash) % colors.length];
  };

  // Get context title for header
  const getContextTitle = () => {
    if (isGroupMode && currentGroup) {
      return `${currentGroup.name} Updates`;
    }
    return 'Integration Updates';
  };

  const getContextDescription = () => {
    const updateCount = totalCount > 0 ? totalCount : items.length;
    const contextName = isGroupMode && currentGroup ? currentGroup.name : 'your integrations';
    
    if (selectedIntegration === 'all') {
      return `${updateCount} total updates from ${contextName}`;
    }
    
    const integrationDisplayName = integrations.find(i => i.name === selectedIntegration)?.displayName || selectedIntegration;
    return `${updateCount} updates from ${integrationDisplayName} in ${contextName}`;
  };

  return (
    <div className="min-h-screen gradient-bg">
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              {getContextTitle()}
            </h1>
            <p className="text-blue-200 text-lg">
              {getContextDescription()}
            </p>
          </div>
          <button 
            onClick={handleRefresh}
            disabled={isLoading}
            className="secondary-button disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center gap-3"
          >
            <svg className={`icon-md ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Integration Filter */}
        {integrations.length > 0 && (
          <div className="modern-card p-6">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex items-center gap-3">
                <svg className="icon-md text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                <span className="font-semibold text-gray-900">Filter by Integration:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleFilterChange('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedIntegration === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All Integrations
                  <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-xs">
                    {integrations.reduce((sum, i) => sum + i.count, 0)}
                  </span>
                </button>
                {integrations.map((integration) => {
                  const colorScheme = getIntegrationColor(integration.name);
                  return (
                    <button
                      key={integration.name}
                      onClick={() => handleFilterChange(integration.name)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                        selectedIntegration === integration.name
                          ? 'ring-2 ring-blue-500 ring-offset-2'
                          : 'hover:scale-105'
                      }`}
                      style={{
                        background: selectedIntegration === integration.name 
                          ? colorScheme.bg 
                          : 'linear-gradient(to right, #f3f4f6, #e5e7eb)',
                        color: selectedIntegration === integration.name 
                          ? colorScheme.text 
                          : '#374151'
                      }}
                    >
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ background: colorScheme.bg }}
                      />
                      {integration.displayName}
                      <span className="ml-1 px-2 py-0.5 bg-white/20 rounded-full text-xs">
                        {integration.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* New Items Notification */}
        {newItems.length > 0 && (
          <div className="modern-card p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-full">
                  <svg className="icon-md text-green-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">New Updates Available!</h3>
                  <p className="text-gray-600">
                    {newItems.length} new update{newItems.length > 1 ? 's' : ''} available! 
                  </p>
                </div>
              </div>
              <button 
                onClick={handleRefresh}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                Refresh to see them
              </button>
            </div>
          </div>
        )}

        {/* Feed Items */}
        <div className="space-y-6">
          {isLoading && items.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="icon-lg animate-spin text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Loading integration updates...</h3>
              <p className="text-blue-200">Fetching the latest changes from your integrations</p>
            </div>
          ) : error ? (
            <div className="modern-card p-12 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="icon-lg text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Error loading feed items</h3>
              <p className="text-gray-600 mb-6">We couldn't load your integration updates. Please try again.</p>
              <button 
                onClick={handleRefresh}
                className="modern-button"
              >
                Try Again
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="modern-card p-16 text-center">
              <div className="w-24 h-24 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-8">
                <svg className="icon-xl text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                </svg>
              </div>
              <h3 className="text-2xl font-semibold text-gray-900 mb-3">
                {selectedIntegration === 'all' ? 'No updates yet' : `No updates from ${integrations.find(i => i.name === selectedIntegration)?.displayName || selectedIntegration}`}
              </h3>
              <p className="text-gray-600 text-lg mb-8 max-w-md mx-auto">
                {selectedIntegration === 'all' 
                  ? 'Add some RSS feeds to start monitoring integration updates and see them here'
                  : 'This integration doesn\'t have any updates yet, or try selecting a different integration'
                }
              </p>
              {selectedIntegration === 'all' ? (
                <a 
                  href="/"
                  className="modern-button inline-flex items-center gap-2"
                >
                  <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Your First Integration
                </a>
              ) : (
                <button 
                  onClick={() => handleFilterChange('all')}
                  className="modern-button inline-flex items-center gap-2"
                >
                  <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  View All Integrations
                </button>
              )}
            </div>
          ) : (
            items.map((item: FeedItem) => (
              <FeedItemCard 
                key={`${item.feedInfo?.id || 'unknown'}-${item.id}`} 
                item={item} 
                timeAgo={getTimeAgo(item.pubDate)}
              />
            ))
          )}
        </div>

        {/* Load More Button */}
        {items.length > 0 && hasMore && (
          <div className="text-center py-8">
            <button 
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="px-8 py-3 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 mx-auto"
            >
              {isLoadingMore ? (
                <>
                  <svg className="icon-sm animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Loading older updates...
                </>
              ) : (
                <>
                  <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Load More Updates
                </>
              )}
            </button>
          </div>
        )}

        {/* End of updates indicator */}
        {items.length > 0 && !hasMore && (
          <div className="text-center py-8">
            <div className="inline-flex items-center gap-2 px-6 py-3 bg-white/5 text-white/60 rounded-xl">
              <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {selectedIntegration === 'all' 
                ? "You've reached the end of all updates"
                : `You've reached the end of ${integrations.find(i => i.name === selectedIntegration)?.displayName || selectedIntegration} updates`
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UnifiedFeed; 