import { useQuery } from '@tanstack/react-query';
import { getAllFeedItems } from '../../services/feedService';
import { useFeedUpdates } from '../../hooks/useFeedUpdates';
import FeedItemCard from './FeedItemCard';
import type { FeedItem } from '../../types/feed';

const UnifiedFeed = () => {
  // Fetch all feed items
  const { data: itemsData, isLoading, error, refetch } = useQuery({
    queryKey: ['allFeedItems'],
    queryFn: getAllFeedItems,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  // Listen for new updates across all feeds
  const { newItems } = useFeedUpdates();

  const items = itemsData?.items || [];
  const totalItems = items.length;

  const handleRefresh = () => {
    refetch();
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

  return (
    <div className="min-h-screen gradient-bg">
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              Integration Updates
            </h1>
            <p className="text-blue-200 text-lg">
              {totalItems} updates from all your integrations
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
          {isLoading ? (
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
              <h3 className="text-2xl font-semibold text-gray-900 mb-3">No updates yet</h3>
              <p className="text-gray-600 text-lg mb-8 max-w-md mx-auto">
                Add some RSS feeds to start monitoring integration updates and see them here
              </p>
              <a 
                href="/"
                className="modern-button inline-flex items-center gap-2"
              >
                <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Your First Integration
              </a>
            </div>
          ) : (
            items.map((item: FeedItem) => (
              <FeedItemCard 
                key={item.id} 
                item={item} 
                timeAgo={getTimeAgo(item.pubDate)}
              />
            ))
          )}
        </div>

        {/* Load More - Placeholder for future pagination */}
        {items.length > 0 && items.length >= 20 && (
          <div className="text-center py-8">
            <button className="px-8 py-3 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-colors font-medium">
              Load More Updates
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UnifiedFeed; 