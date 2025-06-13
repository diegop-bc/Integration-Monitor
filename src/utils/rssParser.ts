import type { FeedItem, FeedError } from '../types/feed';
import { sanitizeHtmlToText } from './textSanitizer';

// For development, we'll use a CORS proxy service
const isDevelopment = import.meta.env.DEV;
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

async function parseRSSContent(xmlContent: string, url: string, integrationName: string, integrationAlias?: string): Promise<FeedItem[]> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlContent, 'text/xml');
  
  // Check for parsing errors
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Invalid XML format');
  }

  const items: FeedItem[] = [];
  
  // Handle both RSS and Atom feeds
  const rssItems = doc.querySelectorAll('item');
  const atomEntries = doc.querySelectorAll('entry');
  
  const feedItems = rssItems.length > 0 ? rssItems : atomEntries;
  
  feedItems.forEach((item, index) => {
    const title = item.querySelector('title')?.textContent || 'Untitled';
    const link = item.querySelector('link')?.textContent || 
                 item.querySelector('link')?.getAttribute('href') || '';
    const description = item.querySelector('description')?.textContent || 
                       item.querySelector('summary')?.textContent || '';
    const content = item.querySelector('content')?.textContent || 
                   item.querySelector('content\\:encoded')?.textContent || 
                   description;
    const pubDate = item.querySelector('pubDate')?.textContent || 
                   item.querySelector('published')?.textContent || 
                   item.querySelector('updated')?.textContent ||
                   new Date().toISOString();
    const guid = item.querySelector('guid')?.textContent || 
                item.querySelector('id')?.textContent || 
                `${url}-${index}`;

    // Sanitize HTML content to plain text
    const sanitizedContent = sanitizeHtmlToText(content);
    const sanitizedDescription = sanitizeHtmlToText(description);

    items.push({
      id: guid,
      title: sanitizeHtmlToText(title),
      link,
      content: sanitizedContent,
      contentSnippet: sanitizedDescription,
      pubDate,
      integrationName,
      integrationAlias,
      createdAt: new Date().toISOString(),
    });
  });

  return items;
}

export async function parseFeed(url: string, integrationName: string, integrationAlias?: string): Promise<{ items: FeedItem[]; error?: FeedError }> {
  try {
    if (isDevelopment) {
      // In development, use CORS proxy and client-side parsing
      const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const xmlContent = await response.text();
      const items = await parseRSSContent(xmlContent, url, integrationName, integrationAlias);
      
      return { items };
    } else {
      // In production, use the serverless function
      const response = await fetch('/api/parse-feed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          integrationName,
          integrationAlias,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          items: [],
          error: errorData.error || {
            code: 'NETWORK_ERROR',
            message: `HTTP ${response.status}: ${response.statusText}`,
          },
        };
      }

      const data = await response.json();
      return { items: data.items };
    }
  } catch (error) {
    const feedError: FeedError = {
      code: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Failed to fetch feed',
      details: error,
    };
    return { items: [], error: feedError };
  }
} 