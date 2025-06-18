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

// Función para sanitizar HTML
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

// Función simplificada para actualización manual
async function updateSingleFeed(feedId: string) {
  try {
    // Obtener el feed
    const { data: feed, error: feedError } = await supabase
      .from('feeds')
      .select('*')
      .eq('id', feedId)
      .single();

    if (feedError || !feed) {
      return { 
        success: false, 
        error: `Feed not found: ${feedError?.message}`,
        feedId 
      };
    }

    // Parsear el feed
    const parsedFeed = await parser.parseURL(feed.url);
    
    const items = parsedFeed.items.map((item) => {
      // Generar ID original del item
      const originalId = item.guid || item.link || `${feed.url}-${item.title}`;
      // Crear ID compuesto con feed ID para evitar duplicados entre usuarios
      const composedId = `${feedId}-${originalId}`;
      
      return {
        id: composedId,
        title: sanitizeHtmlToText(item.title || 'Untitled'),
        link: item.link || '',
        content: sanitizeHtmlToText(item.content || item.contentSnippet || ''),
        contentSnippet: sanitizeHtmlToText(item.contentSnippet || ''),
        pubDate: item.pubDate || new Date().toISOString(),
        integrationName: feed.integration_name,
        integrationAlias: feed.integration_alias,
        createdAt: new Date().toISOString(),
      };
    });

    // Obtener elementos existentes
    const { data: existingItems } = await supabase
      .from('feed_items')
      .select('id')
      .eq('feed_id', feedId);

    // Filtrar elementos nuevos
    const existingIds = new Set(existingItems?.map(item => item.id) || []);
    const newItems = items.filter(item => !existingIds.has(item.id));

    if (newItems.length > 0) {
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
        })), {
          onConflict: 'id',
          ignoreDuplicates: true
        });

      if (insertError) {
        // If it's an RLS error but items already exist, it's not a critical error
        if (insertError.code === '42501' || insertError.message.includes('row-level security')) {
          console.warn(`RLS policy blocked some items for feed ${feedId} (likely duplicates):`, insertError.message);
          // Don't return error, continue with update
        } else {
          return {
            success: false,
            error: insertError.message,
            feedId,
          };
        }
      }
    }

    // Actualizar timestamp
    await supabase
      .from('feeds')
      .update({ last_fetched: new Date().toISOString() })
      .eq('id', feedId);

    return { 
      success: true, 
      newItems: newItems.length,
      totalItems: items.length,
      feedName: feed.integration_name,
      feedId 
    };

  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      feedId 
    };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido. Usa POST.' });
    return;
  }

  try {
    const { feedId, updateAll } = req.body;

    if (updateAll) {
      console.log('🔄 Iniciando actualización manual de todos los feeds...');

      // Obtener todos los feeds
      const { data: feeds, error: feedsError } = await supabase
        .from('feeds')
        .select('*')
        .order('last_fetched', { ascending: true });

      if (feedsError) {
        return res.status(500).json({ 
          error: 'Error obteniendo feeds', 
          details: feedsError 
        });
      }

      if (!feeds || feeds.length === 0) {
        return res.status(200).json({ 
          message: 'No hay feeds para actualizar',
          results: []
        });
      }

      // Actualizar todos los feeds
      const results = await Promise.allSettled(
        feeds.map(feed => updateSingleFeed(feed.id))
      );

      const summary = results.map((result, index) => {
        const feed = feeds[index];
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            success: false,
            error: result.reason,
            feedId: feed.id,
            feedName: feed.integration_name
          };
        }
      });

      const successCount = summary.filter(r => r.success).length;
      const newItemsTotal = summary.reduce((sum, r) => {
        if (r.success && 'newItems' in r && typeof r.newItems === 'number') {
          return sum + r.newItems;
        }
        return sum;
      }, 0);

      return res.status(200).json({
        message: `Actualización completada: ${successCount}/${feeds.length} feeds actualizados`,
        totalNewItems: newItemsTotal,
        results: summary
      });

    } else if (feedId) {
      console.log(`🔄 Actualizando feed específico: ${feedId}`);
      
      const result = await updateSingleFeed(feedId);
      
      if (result.success) {
        return res.status(200).json({
          message: `Feed actualizado exitosamente`,
          result
        });
      } else {
        return res.status(500).json({
          error: 'Error actualizando el feed',
          result
        });
      }

    } else {
      return res.status(400).json({ 
        error: 'Debes proporcionar feedId o updateAll=true' 
      });
    }

  } catch (error) {
    console.error('Error en actualización manual:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 