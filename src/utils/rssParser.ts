import type { FeedItem, FeedError } from '../types/feed';

// Create a simple hash for generating unique IDs
function createItemId(title: string, link: string, pubDate: string): string {
  const input = `${link}-${pubDate}-${title}`.replace(/\s+/g, '-').toLowerCase();
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

function parseRSSContent(
  xmlContent: string,
  integrationName: string,
  integrationAlias?: string,
  feedId?: string
): { items: FeedItem[]; error?: FeedError } {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

    // Check for parsing errors
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      return {
        items: [],
        error: {
          code: 'PARSE_ERROR',
          message: `XML parsing error: ${parseError.textContent}`,
        },
      };
    }

    // Try RSS 2.0 format first
    let items = xmlDoc.querySelectorAll('rss channel item');
    
    // If no RSS items found, try Atom format
    if (items.length === 0) {
      items = xmlDoc.querySelectorAll('feed entry');
    }

    // If still no items, try other common formats
    if (items.length === 0) {
      items = xmlDoc.querySelectorAll('item, entry');
    }

    if (items.length === 0) {
      return {
        items: [],
        error: {
          code: 'PARSE_ERROR',
          message: 'No feed items found in the XML',
        },
      };
    }

    const feedItems: FeedItem[] = [];

    items.forEach((item, index) => {
      try {
        // Extract title
        const titleElement = item.querySelector('title');
        const title = titleElement?.textContent?.trim() || `Item ${index + 1}`;

        // Extract link
        const linkElement = item.querySelector('link');
        let link = linkElement?.textContent?.trim() || linkElement?.getAttribute('href') || '';
        
        // Handle Atom format links
        if (!link) {
          const atomLink = item.querySelector('link[rel="alternate"]');
          link = atomLink?.getAttribute('href') || '';
        }

        // Extract publication date
        const pubDateElement = item.querySelector('pubDate, published, dc\\:date');
        const pubDateStr = pubDateElement?.textContent?.trim() || new Date().toISOString();
        const pubDate = new Date(pubDateStr).toISOString();

        // Extract content
        const contentElement = item.querySelector('description, content, content\\:encoded, summary');
        const content = contentElement?.textContent?.trim() || '';
        
        // Create content snippet
        const contentSnippet = content.length > 300 
          ? content.substring(0, 300) + '...' 
          : content;

        // Create compound ID
        const originalId = createItemId(title, link, pubDate);
        const compoundId = feedId ? `${feedId}-${originalId}` : originalId;

        feedItems.push({
          id: compoundId,
          title,
          link,
          content,
          contentSnippet,
          pubDate,
          integrationName,
          integrationAlias: integrationAlias || '',
          createdAt: new Date().toISOString(),
        });
      } catch (itemError) {
        console.warn(`⚠️ [RSS] Error processing item ${index + 1}:`, itemError);
      }
    });

    return { items: feedItems };
  } catch (error) {
    return {
      items: [],
      error: {
        code: 'PARSE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown parsing error',
        details: error,
      },
    };
  }
}

export async function parseFeed(url: string, integrationName: string, integrationAlias?: string, feedId?: string): Promise<{ items: FeedItem[]; error?: FeedError }> {
  try {
    // Only log the start in development mode if there are issues
    const isDev = import.meta.env.DEV;
    
    let xmlContent = '';

    if (isDev) {
      // Try CORS proxies in development
      const proxies = [
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://api.allorigins.win/raw?url=',
        'https://thingproxy.freeboard.io/fetch/'
      ];

      for (let i = 0; i < proxies.length; i++) {
        try {
          const proxyUrl = `${proxies[i]}${encodeURIComponent(url)}`;
          const response = await fetch(proxyUrl);
          
          if (response.ok) {
            xmlContent = await response.text();
            if (xmlContent && xmlContent.trim().length > 0) {
              break;
            }
          }
        } catch (error) {
          // Continue to next proxy
        }
      }

      // If all proxies failed, try direct fetch
      if (!xmlContent) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            xmlContent = await response.text();
          }
        } catch (error) {
          return {
            items: [],
            error: {
              code: 'NETWORK_ERROR',
              message: `Failed to fetch feed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              details: error,
            },
          };
        }
      }
    } else {
      // Production: try direct fetch first, then fallback to proxy
      try {
        const response = await fetch(url);
        if (response.ok) {
          xmlContent = await response.text();
        }
      } catch (error) {
        // Try one proxy as fallback in production
        try {
          const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
          const response = await fetch(proxyUrl);
          if (response.ok) {
            xmlContent = await response.text();
          }
        } catch (proxyError) {
          return {
            items: [],
            error: {
              code: 'NETWORK_ERROR',
              message: `Failed to fetch feed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              details: error,
            },
          };
        }
      }
    }

    if (!xmlContent || xmlContent.trim().length === 0) {
      return {
        items: [],
        error: {
          code: 'NETWORK_ERROR',
          message: 'Empty response from feed URL',
        },
      };
    }

    // Parse RSS content
    const { items, error } = parseRSSContent(xmlContent, integrationName, integrationAlias, feedId);
    
    if (error) {
      console.error(`❌ [RSS] Parse error for ${integrationName}:`, error.message);
      return { items: [], error };
    }

    // Only log in development or when there are issues
    if (isDev && items.length === 0) {
      console.warn(`⚠️ [RSS] No items found in feed: ${integrationName}`);
    }

    return { items };
  } catch (error) {
    console.error(`💥 [RSS] Exception parsing ${integrationName}:`, error);
    return {
      items: [],
      error: {
        code: 'PARSE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown parsing error',
        details: error,
      },
    };
  }
} 