import type { FeedItem, FeedError } from '../types/feed';
import { sanitizeHtmlToText } from './textSanitizer';

// For development, we'll use a CORS proxy service
const CORS_PROXY = 'https://corsproxy.io/?';

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

    // Mejora en la generación de GUID/ID único
    let guid = item.querySelector('guid')?.textContent || 
               item.querySelector('id')?.textContent;
    
    // Si no hay GUID, crear uno más robusto usando link + fecha + título
    if (!guid) {
      // Crear un hash simple del título + link + fecha para evitar duplicados
      const hashInput = `${link}-${pubDate}-${title}`.replace(/\s+/g, '-').toLowerCase();
      // Si aún no es único, usar el URL + índice como último recurso
      guid = hashInput || `${url}-${index}`;
    }

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

  console.log(`📋 [Debug] parseRSSContent: Parseados ${items.length} items del feed ${url}`);
  
  // Mostrar algunos IDs para debug
  if (items.length > 0) {
    console.log(`🔑 [Debug] Ejemplos de IDs generados:`, items.slice(0, 3).map(item => ({
      id: item.id,
      title: item.title.substring(0, 30) + '...'
    })));
  }

  return items;
}

export async function parseFeed(url: string, integrationName: string, integrationAlias?: string): Promise<{ items: FeedItem[]; error?: FeedError }> {
  try {
    console.log(`🌐 [Debug] Iniciando parseo de feed: ${integrationName} - ${url}`);
    
    // TEMPORARY: Always use CORS proxy to avoid serverless function issues
    const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
    console.log(`🔗 [Debug] Usando CORS proxy: ${proxyUrl}`);
    
    const response = await fetch(proxyUrl);
    
    if (!response.ok) {
      console.error(`❌ [Debug] CORS proxy falló (${response.status}), intentando fetch directo...`);
      // Fallback: try direct fetch (might work for some feeds)
      const directResponse = await fetch(url);
      if (!directResponse.ok) {
        throw new Error(`Both proxy and direct fetch failed. HTTP ${response.status}: ${response.statusText}`);
      }
      const xmlContent = await directResponse.text();
      console.log(`📄 [Debug] Contenido XML obtenido vía fetch directo: ${xmlContent.length} caracteres`);
      const items = await parseRSSContent(xmlContent, url, integrationName, integrationAlias);
      console.log(`✅ [Debug] Successfully parsed ${items.length} items via direct fetch`);
      return { items };
    }
    
    const xmlContent = await response.text();
    console.log(`📄 [Debug] Contenido XML obtenido vía CORS proxy: ${xmlContent.length} caracteres`);
    
    // Mostrar una muestra del contenido XML para debug
    if (xmlContent.length > 0) {
      const xmlSample = xmlContent.substring(0, 500) + (xmlContent.length > 500 ? '...' : '');
      console.log(`🔎 [Debug] Muestra del XML:`, xmlSample);
    }
    
    const items = await parseRSSContent(xmlContent, url, integrationName, integrationAlias);
    
    console.log(`✅ [Debug] Parseo completado exitosamente: ${items.length} items parseados`);
    return { items };
    
    // Original conditional logic commented out temporarily
    /*
    if (isDevelopment) {
      // In development, use CORS proxy and client-side parsing
      const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
      console.log('Using CORS proxy:', proxyUrl);
      
      const response = await fetch(proxyUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const xmlContent = await response.text();
      const items = await parseRSSContent(xmlContent, url, integrationName, integrationAlias);
      
      console.log('Successfully parsed', items.length, 'items');
      return { items };
    } else {
      // In production, use the serverless function
      console.log('Using serverless function /api/parse-feed');
      
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
        const errorText = await response.text();
        console.error('Serverless function error:', errorText);
        
        const errorData = await response.json().catch(() => ({ error: { message: errorText } }));
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
    */
  } catch (error) {
    console.error(`💥 [Debug] Error en parseFeed para ${url}:`, error);
    const feedError: FeedError = {
      code: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Failed to fetch feed',
      details: error,
    };
    return { items: [], error: feedError };
  }
} 