import { supabase } from '../lib/supabase';
import { parseFeed } from '../utils/rssParser';
import type { FeedItem, FeedError } from '../types/feed';

const FETCH_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours in milliseconds (server updates daily)

export async function fetchFeedUpdates(feedId: string): Promise<{ newItems: FeedItem[]; error?: FeedError }> {
  try {
    console.log(`🔍 [Debug] Starting update for feed: ${feedId}`);
    
    // Get the feed details
    const { data: feed, error: feedError } = await supabase
      .from('feeds')
      .select('*')
      .eq('id', feedId)
      .single();

    if (feedError || !feed) {
      console.error(`❌ [Debug] Error getting feed ${feedId}:`, feedError);
      return {
        newItems: [],
        error: {
          code: 'DB_ERROR',
          message: feedError?.message || 'Feed not found',
          details: feedError,
        },
      };
    }

    console.log(`📊 [Debug] Feed found: ${feed.integration_name} - URL: ${feed.url}`);

    // Parse the feed
    const { items, error: parseError } = await parseFeed(
      feed.url,
      feed.integration_name,
      feed.integration_alias,
      feedId
    );

    if (parseError) {
      console.error(`❌ [Debug] Error parsing feed ${feedId}:`, parseError);
      return { newItems: [], error: parseError };
    }

    console.log(`📥 [Debug] Items parsed from remote feed: ${items.length}`);
    
    // Show the first 3 items for debug
    if (items.length > 0) {
      console.log(`🔎 [Debug] First items from remote feed:`, items.slice(0, 3).map(item => ({
        id: item.id,
        title: item.title.substring(0, 50) + '...',
        pubDate: item.pubDate
      })));
    }

    // Get existing items
    const { data: existingItems, error: existingError } = await supabase
      .from('feed_items')
      .select('id, title, pub_date')
      .eq('feed_id', feedId);

    if (existingError) {
      console.error(`❌ [Debug] Error getting existing items for feed ${feedId}:`, existingError);
      return {
        newItems: [],
        error: {
          code: 'DB_ERROR',
          message: existingError.message,
          details: existingError,
        },
      };
    }

    console.log(`📚 [Debug] Existing items in BD: ${existingItems?.length || 0}`);
    
    // Show the first 3 existing items for debug
    if (existingItems && existingItems.length > 0) {
      console.log(`🔎 [Debug] First items in BD:`, existingItems.slice(0, 3).map(item => ({
        id: item.id,
        title: item.title?.substring(0, 50) + '...',
        pubDate: item.pub_date
      })));
    }

    // Filter out existing items
    const existingIds = new Set(existingItems?.map((item: any) => item.id) || []);
    const newItems = items.filter(item => !existingIds.has(item.id));

    console.log(`🆕 [Debug] New items detected: ${newItems.length}`);
    
    // Show the new items for debug
    if (newItems.length > 0) {
      console.log(`🔎 [Debug] New items:`, newItems.map(item => ({
        id: item.id,
        title: item.title.substring(0, 50) + '...',
        pubDate: item.pubDate
      })));
    } else {
      console.log(`ℹ️ [Debug] No new items found. All items already exist in the BD.`);
    }

    if (newItems.length > 0) {
      console.log(`💾 [Debug] Inserting ${newItems.length} new items into the BD...`);
      
      // Insert new items using upsert to handle duplicates and RLS
      const { error: insertError } = await supabase
        .from('feed_items')
        .upsert(newItems.map(item => ({
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
        })), {
          onConflict: 'id',
          ignoreDuplicates: true
        });

      if (insertError) {
        console.error(`❌ [Debug] Error inserting items:`, insertError);
        // If it's a RLS error but the elements already exist, it's not a critical error
        if (insertError.code === '42501' || insertError.message.includes('row-level security')) {
          console.warn('⚠️ [Debug] RLS policy blocked some items (likely duplicates):', insertError.message);
          // No return error, continue with the update
        } else {
          return {
            newItems: [],
            error: {
              code: 'DB_ERROR',
              message: insertError.message,
              details: insertError,
            },
          };
        }
      } else {
        console.log(`✅ [Debug] Items inserted successfully into the BD`);
      }
    }

    // Update last fetched timestamp
    await supabase
      .from('feeds')
      .update({ last_fetched: new Date().toISOString() })
      .eq('id', feedId);

    console.log(`🔄 [Debug] Last update timestamp updated for feed ${feedId}`);
    console.log(`🎉 [Debug] Update completed. ${newItems.length} new items added.`);

    return { newItems };
  } catch (error) {
    console.error(`💥 [Debug] General error in fetchFeedUpdates:`, error);
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
    let query = supabase.from('feeds').select('id');
    
    // If groupId is provided, filter feeds by group
    if (groupId) {
      query = query.eq('group_id', groupId);
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