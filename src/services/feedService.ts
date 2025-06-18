import { supabase } from '../lib/supabase';
import { parseFeed } from '../utils/rssParser';
import type { Feed, FeedItem, FeedError } from '../types/feed';

/**
 * Clean and validate group ID
 */
function cleanGroupId(groupId: string): string {
  // Remove any trailing dots, spaces, or other unwanted characters
  return groupId.trim().replace(/[^a-f0-9-]/gi, '');
}

export async function addFeed(
  url: string, 
  integrationName: string, 
  integrationAlias?: string, 
  groupId?: string | null
): Promise<{ feed: Feed | null; error?: FeedError }> {
  try {
    // Clean groupId if provided
    const cleanedGroupId = groupId ? cleanGroupId(groupId) : null;

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return {
        feed: null,
        error: {
          code: 'AUTH_ERROR',
          message: 'User not authenticated',
          details: userError,
        },
      };
    }

    // First validate the feed without feedId to ensure it's accessible
    const { items: _testItems, error: parseError } = await parseFeed(url, integrationName, integrationAlias);
    
    if (parseError) {
      return { feed: null, error: parseError };
    }

    // Create the feed record first to get the feedId
    // For group feeds, don't assign user_id to prevent them from appearing in personal dashboard
    const { data: feed, error } = await supabase
      .from('feeds')
      .insert({
        url,
        title: integrationName,
        integration_name: integrationName,
        integration_alias: integrationAlias,
        last_fetched: new Date().toISOString(),
        user_id: cleanedGroupId ? null : user.id, // Only assign user_id for personal feeds
        group_id: cleanedGroupId || null,
      })
      .select()
      .single();

    if (error) {
      return {
        feed: null,
        error: {
          code: 'DB_ERROR',
          message: error.message,
          details: error,
        },
      };
    }

    // Now parse the feed again with the feedId to get proper compound IDs
    const { items, error: reparseError } = await parseFeed(url, integrationName, integrationAlias, feed.id);
    
    if (reparseError) {
      // If reparsing fails, delete the feed record and return error
      await supabase.from('feeds').delete().eq('id', feed.id);
      return { feed: null, error: reparseError };
    }

    // Insert the feed items with the feed_id and group_id
    // For group feed items, don't assign user_id to prevent them from appearing in personal dashboard
    const { error: itemsError } = await supabase
      .from('feed_items')
      .insert(items.map(item => ({
        id: item.id,
        feed_id: feed.id,
        title: item.title,
        link: item.link,
        content: item.content,
        content_snippet: item.contentSnippet,
        pub_date: item.pubDate,
        integration_name: item.integrationName,
        integration_alias: item.integrationAlias,
        created_at: item.createdAt,
        user_id: cleanedGroupId ? null : user.id, // Only assign user_id for personal feed items
        group_id: cleanedGroupId || null,
      })));

    if (itemsError) {
      // If items insertion fails, delete the feed record and return error
      await supabase.from('feeds').delete().eq('id', feed.id);
      return {
        feed: null,
        error: {
          code: 'DB_ERROR',
          message: itemsError.message,
          details: itemsError,
        },
      };
    }

    return { 
      feed: {
        id: feed.id,
        url: feed.url,
        title: feed.title,
        description: feed.description,
        integrationName: feed.integration_name,
        integrationAlias: feed.integration_alias,
        lastFetched: feed.last_fetched,
        createdAt: feed.created_at,
        updatedAt: feed.updated_at,
      }
    };
  } catch (error) {
    return {
      feed: null,
      error: {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        details: error,
      },
    };
  }
}

export async function getFeeds(groupId?: string | null): Promise<{ feeds: Feed[]; error?: FeedError }> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return {
        feeds: [],
        error: {
          code: 'AUTH_ERROR',
          message: 'User not authenticated',
          details: userError,
        },
      };
    }

    console.log('🔍 [FEEDSERVICE DEBUG] getFeeds called:', {
      groupId,
      userId: user.id,
      isPersonalMode: groupId === null || groupId === undefined
    })

    // Handle personal feeds with simplified approach
    if (groupId === null || groupId === undefined) {
      // For personal dashboard, show all feeds accessible to the user
      // This includes both personal feeds (group_id IS NULL) and feeds from owned groups
      
      console.log('🔄 [FEEDSERVICE DEBUG] Getting all accessible feeds for personal dashboard...')
      
      // Use a direct query to get all feeds where:
      // 1. user_id matches (personal feeds)
      // 2. OR the user owns the group that contains the feed
      const { data: allFeeds, error: feedsError } = await supabase
        .from('feeds')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      console.log('📊 [FEEDSERVICE DEBUG] All user feeds query response:', {
        error: feedsError,
        feedsCount: allFeeds?.length || 0
      })

      if (feedsError) {
        console.error('❌ [FEEDSERVICE DEBUG] All user feeds query error:', feedsError)
        return {
          feeds: [],
          error: {
            code: 'DB_ERROR',
            message: feedsError.message,
            details: feedsError,
          },
        };
      }

      const mappedFeeds = (allFeeds || []).map((feed: any) => ({
        id: feed.id,
        url: feed.url,
        title: feed.title,
        description: feed.description,
        integrationName: feed.integration_name,
        integrationAlias: feed.integration_alias,
        lastFetched: feed.last_fetched,
        createdAt: feed.created_at,
        updatedAt: feed.updated_at,
      }));

      console.log('✅ [FEEDSERVICE DEBUG] Using all user feeds:', mappedFeeds.length)
      return { feeds: mappedFeeds };
    }

    // For specific group feeds, use the existing logic
    const { data: feedsData, error } = await supabase
      .rpc('get_user_accessible_feeds', { user_uuid: user.id });

    console.log('📊 [FEEDSERVICE DEBUG] Group feeds RPC response:', {
      error,
      feedsDataLength: feedsData?.length || 0
    })

    if (error) {
      console.error('❌ [FEEDSERVICE DEBUG] Group feeds RPC error:', error)
      return {
        feeds: [],
        error: {
          code: 'DB_ERROR',
          message: error.message,
          details: error,
        },
      };
    }

    // Filter by specific group
    const filteredFeeds = (feedsData || []).filter((feed: any) => feed.group_id === groupId);

    console.log('🎯 [FEEDSERVICE DEBUG] Group feeds after filtering:', {
      originalCount: feedsData?.length || 0,
      filteredCount: filteredFeeds.length,
      targetGroupId: groupId
    })

    const mappedFeeds = filteredFeeds.map((feed: any) => ({
      id: feed.id,
      url: feed.url,
      title: feed.title,
      description: feed.description,
      integrationName: feed.integration_name,
      integrationAlias: feed.integration_alias,
      lastFetched: feed.last_fetched,
      createdAt: feed.created_at,
      updatedAt: feed.updated_at,
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

export async function getFeedItems(feedId: string): Promise<{ items: FeedItem[]; error?: FeedError }> {
  try {
    const { data: items, error } = await supabase
      .from('feed_items')
      .select(`
        *,
        feeds!inner(
          id,
          title,
          url
        )
      `)
      .eq('feed_id', feedId)
      .order('pub_date', { ascending: false });

    if (error) {
      return {
        items: [],
        error: {
          code: 'DB_ERROR',
          message: error.message,
          details: error,
        },
      };
    }

    const mappedItems = (items || []).map(item => ({
      id: item.id,
      title: item.title,
      link: item.link,
      content: item.content,
      contentSnippet: item.content_snippet,
      pubDate: item.pub_date,
      integrationName: item.integration_name,
      integrationAlias: item.integration_alias,
      createdAt: item.created_at,
      // Add feed metadata
      feedInfo: {
        id: item.feeds.id,
        title: item.feeds.title,
        url: item.feeds.url,
      }
    }));

    return { items: mappedItems };
  } catch (error) {
    return {
      items: [],
      error: {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        details: error,
      },
    };
  }
}

export async function getAllFeedItems(groupId?: string | null): Promise<{ items: FeedItem[]; error?: FeedError }> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return {
        items: [],
        error: {
          code: 'AUTH_ERROR',
          message: 'User not authenticated',
          details: userError,
        },
      };
    }

    // Handle personal feed items with simplified approach
    if (groupId === null || groupId === undefined) {
      // For personal dashboard, show all feed items from feeds owned by the user
      console.log('🔄 [FEEDSERVICE DEBUG] Getting all feed items for personal dashboard...')
      
      const { data: allItems, error: itemsError } = await supabase
        .from('feed_items')
        .select(`
          *,
          feeds!inner(
            id,
            title,
            url,
            integration_name,
            integration_alias,
            user_id
          )
        `)
        .eq('feeds.user_id', user.id)
        .order('pub_date', { ascending: false })
        .limit(50);

      console.log('📊 [FEEDSERVICE DEBUG] All user feed items query response:', {
        error: itemsError,
        itemsCount: allItems?.length || 0
      })

      if (itemsError) {
        console.error('❌ [FEEDSERVICE DEBUG] All user feed items query error:', itemsError)
        return {
          items: [],
          error: {
            code: 'DB_ERROR',
            message: itemsError.message,
            details: itemsError,
          },
        };
      }

      const mappedItems = (allItems || []).map((item: any) => ({
        id: item.id,
        title: item.title,
        link: item.link,
        content: item.content || '',
        contentSnippet: item.content_snippet,
        pubDate: item.pub_date,
        integrationName: item.integration_name,
        integrationAlias: item.integration_alias || '',
        createdAt: item.created_at,
        feedInfo: {
          id: item.feeds.id,
          title: item.feeds.title,
          url: item.feeds.url,
        }
      }));

      console.log('✅ [FEEDSERVICE DEBUG] Using all user feed items:', mappedItems.length)
      return { items: mappedItems };
    }

    // For specific group items, use existing logic
    let query = supabase
      .from('feed_items')
      .select(`
        *,
        feeds!inner(
          id,
          title,
          url,
          integration_name,
          integration_alias
        )
      `)
      .eq('group_id', groupId)
      .order('pub_date', { ascending: false })
      .limit(50);

    const { data: itemsData, error } = await query;

    if (error) {
      return {
        items: [],
        error: {
          code: 'DB_ERROR',
          message: error.message,
          details: error,
        },
      };
    }

    const mappedItems = (itemsData || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      link: item.link,
      content: item.content || '',
      contentSnippet: item.content_snippet,
      pubDate: item.pub_date,
      integrationName: item.integration_name,
      integrationAlias: item.integration_alias || '',
      createdAt: item.created_at,
      feedInfo: {
        id: item.feeds.id,
        title: item.feeds.title,
        url: item.feeds.url,
      }
    }));

    return { items: mappedItems };
  } catch (error) {
    return {
      items: [],
      error: {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        details: error,
      },
    };
  }
}

// Specific function for public group feed items
export async function getPublicGroupFeedItems(groupId: string): Promise<{ items: FeedItem[]; error?: FeedError }> {
  try {
    // Clean the group ID to remove any unwanted characters
    const cleanedGroupId = cleanGroupId(groupId);
    
    console.log('🔍 [DEBUG] getPublicGroupFeedItems called with:', {
      originalGroupId: groupId,
      cleanedGroupId: cleanedGroupId
    });
    
    // First, let's check if the group is actually public
    const { data: groupCheck, error: groupError } = await supabase
      .rpc('is_group_public', { group_uuid: cleanedGroupId });
    
    console.log('🔐 [DEBUG] Group public check:', {
      isPublic: groupCheck,
      error: groupError
    });
    
    if (groupError) {
      console.error('❌ [DEBUG] Group check error:', groupError);
      return {
        items: [],
        error: {
          code: 'DB_ERROR',
          message: `Group check failed: ${groupError.message}`,
          details: groupError,
        },
      };
    }
    
    if (!groupCheck) {
      console.warn('⚠️ [DEBUG] Group is not public or does not exist');
      return {
        items: [],
        error: {
          code: 'ACCESS_DENIED',
          message: 'Group is not public or does not exist',
        },
      };
    }
    
    // Use RPC function to get public group feed items
    const { data: itemsData, error } = await supabase
      .rpc('get_public_group_recent_items', { 
        group_uuid: cleanedGroupId,
        item_limit: 50
      });

    console.log('📊 [DEBUG] RPC response:', {
      error: error,
      dataLength: itemsData?.length || 0,
      sampleData: itemsData?.slice(0, 2)
    });

    if (error) {
      console.error('❌ [DEBUG] RPC error:', error);
      return {
        items: [],
        error: {
          code: 'DB_ERROR',
          message: error.message,
          details: error,
        },
      };
    }

    const mappedItems = (itemsData || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      link: item.link,
      content: item.content || '',
      contentSnippet: item.content_snippet,
      pubDate: item.pub_date,
      integrationName: item.integration_name,
      integrationAlias: item.integration_alias || '',
      createdAt: item.pub_date, // Use pub_date as created_at fallback
      // Add feed metadata
      feedInfo: {
        id: item.feed_id,
        title: item.feed_title || '',
        url: '', // Not available in RPC response
      }
    }));

    console.log('✅ [DEBUG] Mapped items:', {
      count: mappedItems.length,
      sampleMapped: mappedItems.slice(0, 2)
    });

    return { items: mappedItems };
  } catch (error) {
    console.error('💥 [DEBUG] Exception in getPublicGroupFeedItems:', error);
    return {
      items: [],
      error: {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        details: error,
      },
    };
  }
}

export async function getAllFeedItemsPaginated(
  limit: number = 20, 
  offset: number = 0,
  integrationFilter?: string,
  groupId?: string | null
): Promise<{ items: FeedItem[]; hasMore: boolean; totalCount: number; error?: FeedError }> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return {
        items: [],
        hasMore: false,
        totalCount: 0,
        error: {
          code: 'AUTH_ERROR',
          message: 'User not authenticated',
          details: userError,
        },
      };
    }

    // Handle personal vs group feed items
    let query = supabase
      .from('feed_items')
      .select(`
        *,
        feeds!inner(
          id,
          title,
          url,
          integration_name,
          integration_alias,
          user_id
        )
      `, { count: 'exact' })
      .order('pub_date', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by context - personal vs group
    if (groupId === null || groupId === undefined) {
      // Personal feed items - items from feeds owned by the user
      query = query.eq('feeds.user_id', user.id);
    } else {
      // Group feed items - items with specific group_id
      query = query.eq('group_id', groupId);
    }

    // Apply integration filter if provided
    if (integrationFilter) {
      query = query.eq('integration_name', integrationFilter);
    }

    const { data: items, error, count: totalCount } = await query;

    if (error) {
      return {
        items: [],
        hasMore: false,
        totalCount: 0,
        error: {
          code: 'DB_ERROR',
          message: error.message,
          details: error,
        },
      };
    }

    const mappedItems = (items || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      link: item.link,
      content: item.content || '',
      contentSnippet: item.content_snippet,
      pubDate: item.pub_date,
      integrationName: item.integration_name,
      integrationAlias: item.integration_alias || '',
      createdAt: item.created_at,
      // Add feed metadata
      feedInfo: {
        id: item.feeds.id,
        title: item.feeds.title,
        url: item.feeds.url,
      }
    }));

    const hasMore = offset + limit < (totalCount || 0);

    return { 
      items: mappedItems,
      hasMore,
      totalCount: totalCount || 0
    };
  } catch (error) {
    return {
      items: [],
      hasMore: false,
      totalCount: 0,
      error: {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        details: error,
      },
    };
  }
}

export async function updateFeed(id: string, integrationName: string, integrationAlias?: string): Promise<{ feed: Feed | null; error?: FeedError }> {
  try {
    // Update the feed record
    const { data: feed, error } = await supabase
      .from('feeds')
      .update({
        integration_name: integrationName,
        integration_alias: integrationAlias,
        title: integrationName, // Also update title to match
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return {
        feed: null,
        error: {
          code: 'DB_ERROR',
          message: error.message,
          details: error,
        },
      };
    }

    // Update all associated feed items with the new integration name/alias
    const { error: itemsError } = await supabase
      .from('feed_items')
      .update({
        integration_name: integrationName,
        integration_alias: integrationAlias,
      })
      .eq('feed_id', id);

    if (itemsError) {
      return {
        feed: null,
        error: {
          code: 'DB_ERROR',
          message: itemsError.message,
          details: itemsError,
        },
      };
    }

    return {
      feed: {
        id: feed.id,
        url: feed.url,
        title: feed.title,
        description: feed.description,
        integrationName: feed.integration_name,
        integrationAlias: feed.integration_alias,
        lastFetched: feed.last_fetched,
        createdAt: feed.created_at,
        updatedAt: feed.updated_at,
      }
    };
  } catch (error) {
    return {
      feed: null,
      error: {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        details: error,
      },
    };
  }
}

export async function deleteFeed(id: string): Promise<{ success: boolean; error?: FeedError }> {
  try {
    // First delete all associated feed items
    const { error: itemsError } = await supabase
      .from('feed_items')
      .delete()
      .eq('feed_id', id);

    if (itemsError) {
      return {
        success: false,
        error: {
          code: 'DB_ERROR',
          message: itemsError.message,
          details: itemsError,
        },
      };
    }

    // Then delete the feed record
    const { error: feedError } = await supabase
      .from('feeds')
      .delete()
      .eq('id', id);

    if (feedError) {
      return {
        success: false,
        error: {
          code: 'DB_ERROR',
          message: feedError.message,
          details: feedError,
        },
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        details: error,
      },
    };
  }
}

// Function to get all available integrations with item counts
export async function getIntegrationsWithCounts(groupId?: string | null): Promise<{ 
  integrations: Array<{ name: string; displayName: string; count: number }>; 
  error?: FeedError 
}> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return {
        integrations: [],
        error: {
          code: 'AUTH_ERROR',
          message: 'User not authenticated',
          details: userError,
        },
      };
    }

    // Handle personal vs group integrations
    let query = supabase
      .from('feed_items')
      .select(`
        integration_name, 
        integration_alias,
        feeds!inner(
          user_id
        )
      `)
      .order('integration_name');

    // Filter by context - personal vs group
    if (groupId === null || groupId === undefined) {
      // Personal integrations - items from feeds owned by the user
      query = query.eq('feeds.user_id', user.id);
    } else {
      // Group integrations - items with specific group_id
      query = query.eq('group_id', groupId);
    }

    const { data, error } = await query;

    if (error) {
      return {
        integrations: [],
        error: {
          code: 'DB_ERROR',
          message: error.message,
          details: error,
        },
      };
    }

    // Group by integration name and count items
    const integrationCounts = new Map<string, { displayName: string; count: number }>();
    
    (data || []).forEach((item: any) => {
      const name = item.integration_name;
      const displayName = item.integration_alias || item.integration_name;
      
      if (integrationCounts.has(name)) {
        integrationCounts.get(name)!.count++;
      } else {
        integrationCounts.set(name, { displayName, count: 1 });
      }
    });

    // Convert to sorted array
    const integrations = Array.from(integrationCounts.entries())
      .map(([name, data]) => ({
        name,
        displayName: data.displayName,
        count: data.count
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    return { integrations };
  } catch (error) {
    return {
      integrations: [],
      error: {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        details: error,
      },
    };
  }
} 