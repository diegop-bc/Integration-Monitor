import { supabase } from '../lib/supabase';
import { parseFeed } from '../utils/rssParser';
import type { FeedItem, FeedError } from '../types/feed';

const FETCH_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours in milliseconds (server updates daily)

export async function fetchFeedUpdates(feedId: string): Promise<{ newItems: FeedItem[]; error?: FeedError }> {
  try {
    console.log(`🔍 [Update] Processing feed: ${feedId}`);

    // Get feed details
    const { data: feed, error: feedError } = await supabase
      .from('feeds')
      .select('*')
      .eq('id', feedId)
      .single();

    if (feedError) {
      return {
        newItems: [],
        error: {
          code: 'DB_ERROR',
          message: feedError.message,
          details: feedError,
        },
      };
    }

    if (!feed) {
      return {
        newItems: [],
        error: {
          code: 'NOT_FOUND',
          message: 'Feed not found',
        },
      };
    }

    // Parse feed from remote URL
    const { items: remoteItems, error: parseError } = await parseFeed(
      feed.url,
      feed.integration_name,
      feed.integration_alias,
      feedId
    );

    if (parseError) {
      return {
        newItems: [],
        error: parseError,
      };
    }

    // Get existing items from database for comparison
    const { data: existingItems, error: dbError } = await supabase
      .from('feed_items')
      .select('id')
      .eq('feed_id', feedId);

    if (dbError) {
      return {
        newItems: [],
        error: {
          code: 'DB_ERROR',
          message: dbError.message,
          details: dbError,
        },
      };
    }

    const existingIds = new Set((existingItems || []).map(item => item.id));
    const newItems = remoteItems.filter(item => !existingIds.has(item.id));

    if (newItems.length > 0) {
      console.log(`🆕 [Update] Found ${newItems.length} new items for feed ${feedId}`);
      
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
          user_id: feed.user_id,
          group_id: feed.group_id,
        })));

      if (insertError) {
        // If it's a duplicate key error, that's normal - just return empty array
        if (insertError.code === '23505') {
          return { newItems: [] };
        }
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

    // Update last_fetched timestamp
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

export async function fetchAllFeedUpdates(groupId?: string): Promise<{ updates: Record<string, FeedItem[]>; error?: FeedError }> {
  try {
    // Get current user to filter feeds properly
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return {
        updates: {},
        error: {
          code: 'AUTH_ERROR',
          message: 'User not authenticated',
          details: userError,
        },
      };
    }

    let query = supabase.from('feeds').select('id');
    
    // Filter by context: personal vs group
    if (groupId) {
      // Group feeds: feeds with specific group_id
      query = query.eq('group_id', groupId);
    } else {
      // Personal feeds: feeds owned by the user (group_id IS NULL or user_id matches)
      query = query.eq('user_id', user.id);
    }

    const { data: feeds, error: feedsError } = await query;

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

    console.log(`🔄 [FeedUpdate] Processing ${feeds?.length || 0} ${groupId ? 'group' : 'personal'} feeds...`);

    const updates: Record<string, FeedItem[]> = {};
    const errors: FeedError[] = [];

    // Fetch updates for all feeds in parallel
    await Promise.all(
      (feeds || []).map(async (feed: any) => {
        const { newItems, error } = await fetchFeedUpdates(feed.id);
        if (error) {
          errors.push(error);
        } else if (newItems.length > 0) {
          updates[feed.id] = newItems;
        }
      })
    );

    const totalNewItems = Object.values(updates).reduce((sum, items) => sum + items.length, 0);
    if (totalNewItems > 0) {
      console.log(`✅ [FeedUpdate] Found ${totalNewItems} new items across ${Object.keys(updates).length} feeds`);
    }

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

// New function for forcing manual update from frontend
export async function forceManualUpdate(feedId?: string, groupId?: string | null): Promise<{ success: boolean; message: string; newItems?: number; error?: FeedError }> {
  try {
    // Always use the functions directly without calling the API
    // This avoids problems with the API endpoint in Vercel
    return await forceManualUpdateDirect(feedId, groupId);
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Connection error',
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network error',
        details: error,
      },
    };
  }
}

// Function for direct update (development)
async function forceManualUpdateDirect(feedId?: string, groupId?: string | null): Promise<{ success: boolean; message: string; newItems?: number; error?: FeedError }> {
  try {
    let totalNewItems = 0;
    let updatedFeeds = 0;
    let warnings: string[] = [];

    if (feedId) {
      // Update a specific feed
      const { newItems, error } = await fetchFeedUpdates(feedId);
      if (error) {
        // If it's a RLS/duplicates error, we treat it as a warning
        if (error.code === 'DB_ERROR' && error.details && typeof error.details === 'object' && 'code' in error.details && error.details.code === '42501') {
          return {
            success: true,
            message: `Feed processed (some elements already existed)`,
            newItems: 0,
          };
        }
        return {
          success: false,
          message: `Error updating feed: ${error.message}`,
          error,
        };
      }
      return {
        success: true,
        message: newItems.length > 0 
          ? `Feed updated successfully` 
          : `Feed verified - no new elements`,
        newItems: newItems.length,
      };
    } else {
      // Update all feeds in the group using the existing function
      // If groupId is null, fetchAllFeedUpdates will get all feeds of the user
      const { updates, error } = await fetchAllFeedUpdates(groupId || undefined);
      
      if (error) {
        // If it's a duplicates/RLS error, we try to get useful information
        if (error.code === 'MULTIPLE_ERRORS' && Array.isArray(error.details)) {
          const rlsErrors = error.details.filter((e: any) => 
            e.code === 'DB_ERROR' && e.details?.code === '42501'
          );
          const realErrors = error.details.filter((e: any) => 
            !(e.code === 'DB_ERROR' && e.details?.code === '42501')
          );
          
          if (rlsErrors.length > 0 && realErrors.length === 0) {
            // Only RLS/duplicates errors, continue
            warnings.push(`${rlsErrors.length} feeds had duplicate elements (normal)`);
          } else if (realErrors.length > 0) {
            return {
              success: false,
              message: `Error updating feeds: ${realErrors[0].message}`,
              error: realErrors[0],
            };
          }
        } else {
          return {
            success: false,
            message: `Error updating feeds: ${error.message}`,
            error,
          };
        }
      }

      // Count results
      const feedIds = Object.keys(updates);
      updatedFeeds = feedIds.length;
      totalNewItems = Object.values(updates).reduce((sum, items) => sum + items.length, 0);

      let message = totalNewItems > 0 
        ? `Update completed: ${updatedFeeds} feeds processed, ${totalNewItems} new elements found`
        : `Verification completed: ${updatedFeeds} feeds verified, no new elements`;
      if (warnings.length > 0) {
        message += ` (${warnings.join(', ')})`;
      }

      return {
        success: true,
        message,
        newItems: totalNewItems,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      error: {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error,
      },
    };
  }
}

// New function for getting update statistics
export async function getFeedUpdateStats(): Promise<{ 
  feeds: Array<{ id: string; name: string; lastFetched: string; itemCount: number }>;
  error?: FeedError;
}> {
  try {
    const { data: feeds, error: feedsError } = await supabase
      .from('feeds')
      .select(`
        id,
        integration_name,
        last_fetched,
        feed_items!inner(count)
      `)
      .order('last_fetched', { ascending: true });

    if (feedsError) {
      return {
        feeds: [],
        error: {
          code: 'DB_ERROR',
          message: feedsError.message,
          details: feedsError,
        },
      };
    }

    const mappedFeeds = (feeds || []).map((feed: any) => ({
      id: feed.id,
      name: feed.integration_name,
      lastFetched: feed.last_fetched,
      itemCount: Array.isArray(feed.feed_items) ? feed.feed_items.length : 0,
    }));

    return { feeds: mappedFeeds };
  } catch (error) {
    return {
      feeds: [],
      error: {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        details: error,
      },
    };
  }
} 