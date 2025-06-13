import { supabase } from '../lib/supabase';
import { parseFeed } from '../utils/rssParser';
import type { FeedItem, FeedError } from '../types/feed';

const FETCH_INTERVAL = 15 * 60 * 1000; // 15 minutes in milliseconds

export async function fetchFeedUpdates(feedId: string): Promise<{ newItems: FeedItem[]; error?: FeedError }> {
  try {
    // Get the feed details
    const { data: feed, error: feedError } = await supabase
      .from('feeds')
      .select('*')
      .eq('id', feedId)
      .single();

    if (feedError || !feed) {
      return {
        newItems: [],
        error: {
          code: 'DB_ERROR',
          message: feedError?.message || 'Feed not found',
          details: feedError,
        },
      };
    }

    // Parse the feed
    const { items, error: parseError } = await parseFeed(
      feed.url,
      feed.integration_name,
      feed.integration_alias
    );

    if (parseError) {
      return { newItems: [], error: parseError };
    }

    // Get existing items
    const { data: existingItems, error: existingError } = await supabase
      .from('feed_items')
      .select('id')
      .eq('feed_id', feedId);

    if (existingError) {
      return {
        newItems: [],
        error: {
          code: 'DB_ERROR',
          message: existingError.message,
          details: existingError,
        },
      };
    }

    // Filter out existing items
    const existingIds = new Set(existingItems?.map(item => item.id) || []);
    const newItems = items.filter(item => !existingIds.has(item.id));

    if (newItems.length > 0) {
      // Insert new items
      const { error: insertError } = await supabase
        .from('feed_items')
        .insert(newItems.map(item => ({
          id: item.id,
          feed_id: feedId,
          title: item.title,
          link: item.link,
          content: item.content,
          content_snippet: item.contentSnippet,
          pub_date: item.pubDate,
          integration_name: item.integrationName,
          integration_alias: item.integrationAlias,
          created_at: item.createdAt,
        })));

      if (insertError) {
        return {
          newItems: [],
          error: {
            code: 'DB_ERROR',
            message: insertError.message,
            details: insertError,
          },
        };
      }
    }

    // Update last fetched timestamp
    await supabase
      .from('feeds')
      .update({ last_fetched: new Date().toISOString() })
      .eq('id', feedId);

    return { newItems };
  } catch (error) {
    return {
      newItems: [],
      error: {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        details: error,
      },
    };
  }
}

export async function startFeedUpdates(feedId: string, onUpdate: (newItems: FeedItem[]) => void): Promise<() => void> {
  let isRunning = true;

  const fetchUpdates = async () => {
    if (!isRunning) return;

    const { newItems, error } = await fetchFeedUpdates(feedId);
    
    if (!error && newItems.length > 0) {
      onUpdate(newItems);
    }

    // Schedule next update
    if (isRunning) {
      setTimeout(fetchUpdates, FETCH_INTERVAL);
    }
  };

  // Start the first fetch
  fetchUpdates();

  // Return cleanup function
  return () => {
    isRunning = false;
  };
}

export async function fetchAllFeedUpdates(): Promise<{ updates: Record<string, FeedItem[]>; error?: FeedError }> {
  try {
    const { data: feeds, error: feedsError } = await supabase
      .from('feeds')
      .select('id');

    if (feedsError) {
      return {
        updates: {},
        error: {
          code: 'DB_ERROR',
          message: feedsError.message,
          details: feedsError,
        },
      };
    }

    const updates: Record<string, FeedItem[]> = {};
    const errors: FeedError[] = [];

    // Fetch updates for all feeds in parallel
    await Promise.all(
      (feeds || []).map(async (feed) => {
        const { newItems, error } = await fetchFeedUpdates(feed.id);
        if (error) {
          errors.push(error);
        } else if (newItems.length > 0) {
          updates[feed.id] = newItems;
        }
      })
    );

    return {
      updates,
      error: errors.length > 0
        ? {
            code: 'MULTIPLE_ERRORS',
            message: `Errors occurred while fetching ${errors.length} feeds`,
            details: errors,
          }
        : undefined,
    };
  } catch (error) {
    return {
      updates: {},
      error: {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        details: error,
      },
    };
  }
} 