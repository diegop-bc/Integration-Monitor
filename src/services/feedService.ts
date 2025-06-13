import { supabase } from '../lib/supabase';
import { parseFeed } from '../utils/rssParser';
import type { Feed, FeedItem, FeedError } from '../types/feed';

export async function addFeed(url: string, integrationName: string, integrationAlias?: string): Promise<{ feed: Feed | null; error?: FeedError }> {
  try {
    // First parse the feed to validate it
    const { items, error: parseError } = await parseFeed(url, integrationName, integrationAlias);
    
    if (parseError) {
      return { feed: null, error: parseError };
    }

    // Create the feed record
    const { data: feed, error } = await supabase
      .from('feeds')
      .insert({
        url,
        title: integrationName,
        integration_name: integrationName,
        integration_alias: integrationAlias,
        last_fetched: new Date().toISOString(),
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

    // Insert the feed items with the feed_id
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