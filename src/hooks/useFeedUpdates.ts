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