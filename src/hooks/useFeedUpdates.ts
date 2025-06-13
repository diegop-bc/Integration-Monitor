import { useState, useEffect } from 'react';
import { startFeedUpdates, fetchAllFeedUpdates } from '../services/feedUpdateService';
import type { FeedItem, FeedError } from '../types/feed';

export function useFeedUpdates(feedId?: string) {
  const [newItems, setNewItems] = useState<FeedItem[]>([]);
  const [error, setError] = useState<FeedError | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const startUpdates = async () => {
      if (feedId) {
        // Single feed updates
        cleanup = await startFeedUpdates(feedId, (items) => {
          setNewItems((prev) => [...items, ...prev]);
        });
      } else {
        // All feeds updates
        const updateAll = async () => {
          setIsLoading(true);
          const { updates, error } = await fetchAllFeedUpdates();
          
          if (error) {
            setError(error);
          } else {
            const allNewItems = Object.values(updates).flat();
            setNewItems((prev) => [...allNewItems, ...prev]);
          }
          setIsLoading(false);
        };

        // Initial fetch
        updateAll();

        // Set up interval for all feeds
        const interval = setInterval(updateAll, 15 * 60 * 1000); // 15 minutes
        cleanup = () => clearInterval(interval);
      }
    };

    startUpdates();

    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, [feedId]);

  const clearNewItems = () => {
    setNewItems([]);
  };

  return {
    newItems,
    error,
    isLoading,
    clearNewItems,
  };
}

// Hook for paginated feed items
export function usePaginatedFeedItems(limit: number = 20, integrationFilter?: string) {
  const [allItems, setAllItems] = useState<FeedItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const loadMore = async () => {
    if (isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    const offset = allItems.length;
    
    try {
      const { getAllFeedItemsPaginated } = await import('../services/feedService');
      const { items, hasMore: moreAvailable, totalCount: total, error } = 
        await getAllFeedItemsPaginated(limit, offset, integrationFilter);
      
      if (error) {
        console.error('Error loading more items:', error);
        return;
      }
      
      setAllItems(prev => [...prev, ...items]);
      setHasMore(moreAvailable);
      setTotalCount(total);
    } catch (error) {
      console.error('Error loading more items:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const reset = () => {
    setAllItems([]);
    setHasMore(true);
    setTotalCount(0);
  };

  const loadInitialData = async () => {
    if (isLoadingMore) return;
    
    setIsLoadingMore(true);
    
    try {
      const { getAllFeedItemsPaginated } = await import('../services/feedService');
      const { items, hasMore: moreAvailable, totalCount: total, error } = 
        await getAllFeedItemsPaginated(limit, 0, integrationFilter);
      
      if (error) {
        console.error('Error loading initial items:', error);
        return;
      }
      
      setAllItems(items);
      setHasMore(moreAvailable);
      setTotalCount(total);
    } catch (error) {
      console.error('Error loading initial items:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Reset and load initial data when filter changes
  useEffect(() => {
    reset();
    loadInitialData();
  }, [integrationFilter]);

  return {
    items: allItems,
    loadMore,
    hasMore,
    isLoadingMore,
    totalCount,
    reset,
  };
}

// Hook for fetching available integrations
export function useIntegrations() {
  const [integrations, setIntegrations] = useState<Array<{ name: string; displayName: string; count: number }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<FeedError | null>(null);

  const fetchIntegrations = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { getIntegrationsWithCounts } = await import('../services/feedService');
      const { integrations: data, error: fetchError } = await getIntegrationsWithCounts();
      
      if (fetchError) {
        setError(fetchError);
      } else {
        setIntegrations(data);
      }
    } catch (err) {
      setError({
        code: 'UNKNOWN_ERROR',
        message: err instanceof Error ? err.message : 'Failed to fetch integrations',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrations();
  }, []);

  return {
    integrations,
    isLoading,
    error,
    refetch: fetchIntegrations,
  };
} 