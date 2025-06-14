import { supabase } from '../lib/supabase';
import { parseFeed } from '../utils/rssParser';
import type { Feed, FeedItem, FeedError } from '../types/feed';

export async function addFeed(url: string, integrationName: string, integrationAlias?: string): Promise<{ feed: Feed | null; error?: FeedError }> {
  try {
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

    // First parse the feed to validate it
    const { items, error: parseError } = await parseFeed(url, integrationName, integrationAlias);
    
    if (parseError) {
      return { feed: null, error: parseError };
    }

    // Create the feed record with user_id
    const { data: feed, error } = await supabase
      .from('feeds')
      .insert({
        url,
        title: integrationName,
        integration_name: integrationName,
        integration_alias: integrationAlias,
        last_fetched: new Date().toISOString(),
        user_id: user.id,
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

    // Insert the feed items with the feed_id and user_id
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
        user_id: user.id,
      })));

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

export async function getFeeds(): Promise<{ feeds: Feed[]; error?: FeedError }> {
  try {
    const { data: feeds, error } = await supabase
      .from('feeds')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return {
        feeds: [],
        error: {
          code: 'DB_ERROR',
          message: error.message,
          details: error,
        },
      };
    }

    const mappedFeeds = (feeds || []).map(feed => ({
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
      .select('*')
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

export async function getAllFeedItems(): Promise<{ items: FeedItem[]; error?: FeedError }> {
  try {
    const { data: items, error } = await supabase
      .from('feed_items')
      .select(`
        *,
        feeds!inner(
          id,
          title,
          integration_name,
          integration_alias,
          url
        )
      `)
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

export async function getAllFeedItemsPaginated(
  limit: number = 20, 
  offset: number = 0,
  integrationFilter?: string
): Promise<{ items: FeedItem[]; hasMore: boolean; totalCount: number; error?: FeedError }> {
  try {
    // Build query with optional integration filter
    let countQuery = supabase.from('feed_items').select('*', { count: 'exact', head: true });
    let itemsQuery = supabase
      .from('feed_items')
      .select(`
        *,
        feeds!inner(
          id,
          title,
          integration_name,
          integration_alias,
          url
        )
      `)
      .order('pub_date', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply integration filter if provided
    if (integrationFilter && integrationFilter !== 'all') {
      countQuery = countQuery.eq('integration_name', integrationFilter);
      itemsQuery = itemsQuery.eq('integration_name', integrationFilter);
    }

    // Get total count with filter
    const { count: totalCount, error: countError } = await countQuery;

    if (countError) {
      return {
        items: [],
        hasMore: false,
        totalCount: 0,
        error: {
          code: 'DB_ERROR',
          message: countError.message,
          details: countError,
        },
      };
    }

    // Get paginated items with filter
    const { data: items, error } = await itemsQuery;

    if (error) {
      return {
        items: [],
        hasMore: false,
        totalCount: totalCount || 0,
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
export async function getIntegrationsWithCounts(): Promise<{ 
  integrations: Array<{ name: string; displayName: string; count: number }>; 
  error?: FeedError 
}> {
  try {
    const { data, error } = await supabase
      .from('feed_items')
      .select('integration_name, integration_alias')
      .order('integration_name');

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
    
    (data || []).forEach(item => {
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