import type { VercelRequest, VercelResponse } from '@vercel/node';
import Parser from 'rss-parser';

const parser = new Parser({
  customFields: {
    item: [
      ['content:encoded', 'content'],
      ['description', 'contentSnippet'],
    ],
  },
});

// Server-side HTML sanitization function
function sanitizeHtmlToText(html: string): string {
  if (!html) return '';
  
  // Convert HTML lists to plain text format before removing tags
  let text = html
    // Convert unordered list items to bullets
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    // Convert ordered lists (basic approach - doesn't handle nested numbering)
    .replace(/<ol[^>]*>/gi, '')
    .replace(/<\/ol>/gi, '\n')
    .replace(/<ul[^>]*>/gi, '')
    .replace(/<\/ul>/gi, '\n')
    // Add line breaks for block elements
    .replace(/<\/p>/gi, '\n')
    .replace(/<br[^>]*>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n');
  
  // Remove remaining HTML tags
  text = text.replace(/<[^>]*>/g, '');
  
  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '...')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"');
  
  // Clean up extra whitespace but preserve line breaks
  text = text.replace(/[ \t]+/g, ' '); // Replace multiple spaces/tabs with single space
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n'); // Replace multiple line breaks with double
  text = text.trim();
  
  return text;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { url, integrationName, integrationAlias, feedId } = req.body;

    if (!url || !integrationName) {
      res.status(400).json({ error: 'URL and integrationName are required' });
      return;
    }

    const feed = await parser.parseURL(url);
    
    const items = feed.items.map((item) => {
      // Generar ID original del item
      const originalId = item.guid || item.link || `${url}-${item.title}`;
      // Crear ID compuesto con feed ID si está disponible
      const composedId = feedId ? `${feedId}-${originalId}` : originalId;
      
      return {
        id: composedId,
        title: sanitizeHtmlToText(item.title || 'Untitled'),
        link: item.link || '',
        content: sanitizeHtmlToText(item.content || item.contentSnippet || ''),
        contentSnippet: sanitizeHtmlToText(item.contentSnippet || ''),
        pubDate: item.pubDate || new Date().toISOString(),
        integrationName,
        integrationAlias,
        createdAt: new Date().toISOString(),
      };
    });

    res.status(200).json({ items });
  } catch (error) {
    console.error('Feed parsing error:', error);
    res.status(500).json({
      error: {
        code: 'PARSE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to parse feed',
        details: error,
      },
    });
  }
} 