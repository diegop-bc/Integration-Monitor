import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';

// Configuración de Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

const parser = new Parser({
  customFields: {
    item: [
      ['content:encoded', 'content'],
      ['description', 'contentSnippet'],
    ],
  },
});

// Tipos de datos
interface ProcessingResult {
  feedId: string;
  integrationName: string;
  newItems: number;
  errors: number;
  status: 'success' | 'failed';
  error?: any;
}

interface UpdateResult {
  newItems: number;
  errors: any[];
}

// Función para sanitizar HTML (misma que en parse-feed.ts)
function sanitizeHtmlToText(html: string): string {
  if (!html) return '';
  
  let text = html
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<ol[^>]*>/gi, '')
    .replace(/<\/ol>/gi, '\n')
    .replace(/<ul[^>]*>/gi, '')
    .replace(/<\/ul>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<br[^>]*>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n');
  
  text = text.replace(/<[^>]*>/g, '');
  
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
  
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  text = text.trim();
  
  return text;
}

// Función para parsear un feed RSS
async function parseFeedFromUrl(url: string, integrationName: string, integrationAlias?: string, feedId?: string) {
  try {
    const feed = await parser.parseURL(url);
    
    const items = feed.items.map((item) => {
      // Generar ID original del item
      const originalId = item.guid || item.link || `${url}-${item.title}`;
      // Crear ID compuesto con feed ID para evitar duplicados entre usuarios
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

    return { items, error: null };
  } catch (error) {
    console.error(`Error parsing feed ${url}:`, error);
    return {
      items: [],
      error: {
        code: 'PARSE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to parse feed',
        url,
      },
    };
  }
}

// Función para actualizar un feed específico
async function updateFeed(feed: any): Promise<UpdateResult> {
  const { items, error: parseError } = await parseFeedFromUrl(
    feed.url,
    feed.integration_name,
    feed.integration_alias,
    feed.id
  );

  if (parseError) {
    console.error(`Error parsing feed ${feed.id}:`, parseError);
    return { newItems: 0, errors: [parseError] };
  }

  // Obtener elementos existentes
  const { data: existingItems, error: existingError } = await supabase
    .from('feed_items')
    .select('id')
    .eq('feed_id', feed.id);

  if (existingError) {
    console.error(`Error fetching existing items for feed ${feed.id}:`, existingError);
    return { newItems: 0, errors: [existingError] };
  }

  // Filtrar elementos nuevos
  const existingIds = new Set(existingItems?.map(item => item.id) || []);
  const newItems = items.filter(item => !existingIds.has(item.id));

  if (newItems.length > 0) {
    // Insertar nuevos elementos
    const { error: insertError } = await supabase
      .from('feed_items')
      .insert(newItems.map(item => ({
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
        user_id: feed.user_id,
        group_id: feed.group_id,
      })));

    if (insertError) {
      console.error(`Error inserting new items for feed ${feed.id}:`, insertError);
      return { newItems: 0, errors: [insertError] };
    }
  }

  // Actualizar timestamp de última obtención
  await supabase
    .from('feeds')
    .update({ last_fetched: new Date().toISOString() })
    .eq('id', feed.id);

  return { newItems: newItems.length, errors: [] };
}

/**
 * Vercel Cron Job for Automatic Feed Updates
 * 
 * This function runs automatically every day at 8:00 AM UTC to fetch
 * and update all RSS feeds in the system.
 * 
 * Schedule: Daily at 8:00 AM UTC (0 8 * * *)
 * Vercel Free Plan: Only supports daily cron jobs
 * 
 * Features:
 * - Fetches all feeds from database
 * - Parses RSS feeds for new items
 * - Inserts only new items (prevents duplicates)
 * - Processes feeds in batches to avoid timeouts
 * - Updates last_fetched timestamps
 * - Comprehensive error handling and logging
 * 
 * Security: Requires CRON_SECRET environment variable
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verificar que es una solicitud de cron job
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('🔄 Iniciando actualización automática diaria de feeds...');

  try {
    // Obtener todos los feeds activos
    const { data: feeds, error: feedsError } = await supabase
      .from('feeds')
      .select('*')
      .order('last_fetched', { ascending: true }); // Priorizar feeds menos recientes

    if (feedsError) {
      console.error('Error obteniendo feeds:', feedsError);
      return res.status(500).json({ error: 'Failed to fetch feeds', details: feedsError });
    }

    if (!feeds || feeds.length === 0) {
      console.log('No hay feeds para actualizar');
      return res.status(200).json({ message: 'No feeds to update', totalFeeds: 0 });
    }

    console.log(`📡 Actualizando ${feeds.length} feeds...`);

    let totalNewItems = 0;
    let totalErrors = 0;
    const processingResults: ProcessingResult[] = [];

    // Procesar feeds en lotes para evitar timeouts
    const batchSize = 5;
    for (let i = 0; i < feeds.length; i += batchSize) {
      const batch = feeds.slice(i, i + batchSize);
      
      const batchResults = await Promise.allSettled(
        batch.map(async (feed) => {
          console.log(`⏳ Actualizando feed: ${feed.integration_name} (${feed.url})`);
          return updateFeed(feed);
        })
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const feed = batch[j];
        
        if (result.status === 'fulfilled') {
          const { newItems, errors } = result.value;
          totalNewItems += newItems;
          totalErrors += errors.length;
          
          processingResults.push({
            feedId: feed.id,
            integrationName: feed.integration_name,
            newItems,
            errors: errors.length,
            status: 'success'
          });
          
          if (newItems > 0) {
            console.log(`✅ ${feed.integration_name}: ${newItems} nuevos elementos`);
          }
        } else {
          totalErrors++;
          processingResults.push({
            feedId: feed.id,
            integrationName: feed.integration_name,
            newItems: 0,
            errors: 1,
            status: 'failed',
            error: result.reason
          });
          
          console.error(`❌ Error actualizando ${feed.integration_name}:`, result.reason);
        }
      }
    }

    const summary = {
      timestamp: new Date().toISOString(),
      totalFeeds: feeds.length,
      totalNewItems,
      totalErrors,
      processingResults
    };

    console.log(`🎉 Actualización completada: ${totalNewItems} nuevos elementos, ${totalErrors} errores`);

    return res.status(200).json({
      message: 'Feed update completed',
      summary
    });

  } catch (error) {
    console.error('Error durante la actualización de feeds:', error);
    return res.status(500).json({
      error: 'Feed update failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 