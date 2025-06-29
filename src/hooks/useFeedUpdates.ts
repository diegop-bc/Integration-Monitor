import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { startFeedUpdates, fetchAllFeedUpdates, forceManualUpdate, getFeedUpdateStats } from '../services/feedUpdateService';
import type { FeedItem, FeedError } from '../types/feed';

export function useFeedUpdates(feedId?: string, contextId?: string | null) {
  const [newItems, setNewItems] = useState<FeedItem[]>([]);
  const [error, setError] = useState<FeedError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isUpdatingRef = useRef(false);
  const cleanupRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    // Prevent multiple simultaneous updates
    if (isUpdatingRef.current) return;

    const startUpdates = async () => {
      isUpdatingRef.current = true;
      
      try {
        if (feedId) {
          // Single feed updates
          cleanupRef.current = await startFeedUpdates(feedId, (items) => {
            setNewItems((prev) => [...items, ...prev]);
          });
        } else {
          // All feeds updates - with specific context and longer intervals
          const updateAll = async () => {
            if (isUpdatingRef.current && !feedId) return; // Prevent overlapping updates
            
            setIsLoading(true);
            const { updates, error } = await fetchAllFeedUpdates(contextId || undefined);
            
            if (error) {
              setError(error);
            } else {
              const allNewItems = Object.values(updates).flat();
              if (allNewItems.length > 0) {
                setNewItems((prev) => [...allNewItems, ...prev]);
              }
            }
            setIsLoading(false);
          };

          // Initial fetch
          await updateAll();

          // Set up interval for background updates (reduced frequency)
          const interval = setInterval(updateAll, 6 * 60 * 60 * 1000); // 6 hours instead of 4
          cleanupRef.current = () => clearInterval(interval);
        }
      } finally {
        isUpdatingRef.current = false;
      }
    };

    startUpdates();

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = undefined;
      }
      isUpdatingRef.current = false;
    };
  }, [feedId, contextId]); // Removed newItems.length dependency to prevent loops

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

// Nuevo hook para actualización manual
export function useManualFeedUpdate(groupId?: string | null) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<{
    success: boolean;
    message: string;
    newItems?: number;
    timestamp: Date;
  } | null>(null);

  const updateFeed = async (feedId?: string) => {
    setIsUpdating(true);
    try {
      const result = await forceManualUpdate(feedId, groupId);
      setLastUpdate({
        ...result,
        timestamp: new Date(),
      });
      return result;
    } catch (error) {
      const errorResult = {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
      setLastUpdate(errorResult);
      return errorResult;
    } finally {
      setIsUpdating(false);
    }
  };

  const updateAllFeeds = () => updateFeed();
  const updateSingleFeed = (feedId: string) => updateFeed(feedId);

  return {
    isUpdating,
    lastUpdate,
    updateAllFeeds,
    updateSingleFeed,
  };
}

// Hook para estadísticas de feeds
export function useFeedStats() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Array<{ id: string; name: string; lastFetched: string; itemCount: number }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<FeedError | null>(null);

  const fetchStats = async () => {
    if (!user) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const { feeds, error: statsError } = await getFeedUpdateStats();
      
      if (statsError) {
        setError(statsError);
      } else {
        setStats(feeds);
      }
    } catch (err) {
      setError({
        code: 'UNKNOWN_ERROR',
        message: err instanceof Error ? err.message : 'Error obtaining statistics',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchStats();
    } else {
      setStats([]);
    }
  }, [user?.id]);

  return {
    stats,
    isLoading,
    error,
    refetchStats: fetchStats,
  };
}

// Hook for paginated feed items
export function usePaginatedFeedItems(limit: number = 20, integrationFilter?: string, groupId?: string | null) {
  const { user } = useAuth();
  const [allItems, setAllItems] = useState<FeedItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const loadMore = async () => {
    if (isLoadingMore || !hasMore || !user) return;
    
    setIsLoadingMore(true);
    const offset = allItems.length;
    
    try {
      const { getAllFeedItemsPaginated } = await import('../services/feedService');
      const { items, hasMore: moreAvailable, totalCount: total, error } = 
        await getAllFeedItemsPaginated(limit, offset, integrationFilter, groupId);
      
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
    if (isLoadingMore || !user) return;
    
    setIsLoadingMore(true);
    
    try {
      const { getAllFeedItemsPaginated } = await import('../services/feedService');
      const { items, hasMore: moreAvailable, totalCount: total, error } = 
        await getAllFeedItemsPaginated(limit, 0, integrationFilter, groupId);
      
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

  // Reset and load initial data when filter changes, group changes, or user changes
  useEffect(() => {
    if (user) {
      reset();
      loadInitialData();
    }
  }, [integrationFilter, groupId, user?.id]);

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
export function useIntegrations(groupId?: string | null) {
  const { user } = useAuth();
  const [integrations, setIntegrations] = useState<Array<{ name: string; displayName: string; count: number }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<FeedError | null>(null);

  const fetchIntegrations = async () => {
    if (!user) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const { getIntegrationsWithCounts } = await import('../services/feedService');
      const { integrations: data, error: fetchError } = await getIntegrationsWithCounts(groupId);
      
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
    if (user) {
      fetchIntegrations();
    } else {
      setIntegrations([]);
    }
  }, [user?.id, groupId]);

  return {
    integrations,
    isLoading,
    error,
    refetch: fetchIntegrations,
  };
} 