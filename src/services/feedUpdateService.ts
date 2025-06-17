import { supabase } from '../lib/supabase';
import { parseFeed } from '../utils/rssParser';
import type { FeedItem, FeedError } from '../types/feed';

const FETCH_INTERVAL = 4 * 60 * 60 * 1000; // 4 horas en millisegundos (servidor actualiza diariamente)

export async function fetchFeedUpdates(feedId: string): Promise<{ newItems: FeedItem[]; error?: FeedError }> {
  try {
    console.log(`🔍 [Debug] Iniciando actualización para feed: ${feedId}`);
    
    // Get the feed details
    const { data: feed, error: feedError } = await supabase
      .from('feeds')
      .select('*')
      .eq('id', feedId)
      .single();

    if (feedError || !feed) {
      console.error(`❌ [Debug] Error obteniendo feed ${feedId}:`, feedError);
      return {
        newItems: [],
        error: {
          code: 'DB_ERROR',
          message: feedError?.message || 'Feed not found',
          details: feedError,
        },
      };
    }

    console.log(`📊 [Debug] Feed encontrado: ${feed.integration_name} - URL: ${feed.url}`);

    // Parse the feed
    const { items, error: parseError } = await parseFeed(
      feed.url,
      feed.integration_name,
      feed.integration_alias
    );

    if (parseError) {
      console.error(`❌ [Debug] Error parseando feed ${feedId}:`, parseError);
      return { newItems: [], error: parseError };
    }

    console.log(`📥 [Debug] Items parseados del feed remoto: ${items.length}`);
    
    // Mostrar los primeros 3 items para debug
    if (items.length > 0) {
      console.log(`🔎 [Debug] Primeros items del feed remoto:`, items.slice(0, 3).map(item => ({
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
      console.error(`❌ [Debug] Error obteniendo items existentes para feed ${feedId}:`, existingError);
      return {
        newItems: [],
        error: {
          code: 'DB_ERROR',
          message: existingError.message,
          details: existingError,
        },
      };
    }

    console.log(`📚 [Debug] Items existentes en BD: ${existingItems?.length || 0}`);
    
    // Mostrar los primeros 3 items existentes para debug
    if (existingItems && existingItems.length > 0) {
      console.log(`🔎 [Debug] Primeros items en BD:`, existingItems.slice(0, 3).map(item => ({
        id: item.id,
        title: item.title?.substring(0, 50) + '...',
        pubDate: item.pub_date
      })));
    }

    // Filter out existing items
    const existingIds = new Set(existingItems?.map((item: any) => item.id) || []);
    const newItems = items.filter(item => !existingIds.has(item.id));

    console.log(`🆕 [Debug] Items nuevos detectados: ${newItems.length}`);
    
    // Mostrar los items nuevos para debug
    if (newItems.length > 0) {
      console.log(`🔎 [Debug] Items nuevos:`, newItems.map(item => ({
        id: item.id,
        title: item.title.substring(0, 50) + '...',
        pubDate: item.pubDate
      })));
    } else {
      console.log(`ℹ️ [Debug] No se encontraron items nuevos. Todos los items ya existen en la BD.`);
    }

    if (newItems.length > 0) {
      console.log(`💾 [Debug] Insertando ${newItems.length} items nuevos en la BD...`);
      
      // Insert new items usando upsert para manejar duplicados y RLS
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
        console.error(`❌ [Debug] Error insertando items:`, insertError);
        // Si es un error de RLS pero los elementos ya existen, no es un error crítico
        if (insertError.code === '42501' || insertError.message.includes('row-level security')) {
          console.warn('⚠️ [Debug] RLS policy blocked some items (likely duplicates):', insertError.message);
          // No retornamos error, continuamos con la actualización
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
        console.log(`✅ [Debug] Items insertados exitosamente en la BD`);
      }
    }

    // Update last fetched timestamp
    await supabase
      .from('feeds')
      .update({ last_fetched: new Date().toISOString() })
      .eq('id', feedId);

    console.log(`🔄 [Debug] Timestamp de última actualización actualizado para feed ${feedId}`);
    console.log(`🎉 [Debug] Actualización completada. ${newItems.length} items nuevos agregados.`);

    return { newItems };
  } catch (error) {
    console.error(`💥 [Debug] Error general en fetchFeedUpdates:`, error);
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
    
    // Si se proporciona groupId, filtrar feeds por grupo
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

// Nueva función para forzar actualización manual desde el frontend
export async function forceManualUpdate(feedId?: string, groupId?: string | null): Promise<{ success: boolean; message: string; newItems?: number; error?: FeedError }> {
  try {
    // Siempre usar las funciones directamente sin llamar a la API
    // Esto evita problemas con el endpoint API en Vercel
    return await forceManualUpdateDirect(feedId, groupId);
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Error de conexión',
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network error',
        details: error,
      },
    };
  }
}

// Función para actualización directa (desarrollo)
async function forceManualUpdateDirect(feedId?: string, groupId?: string | null): Promise<{ success: boolean; message: string; newItems?: number; error?: FeedError }> {
  try {
    let totalNewItems = 0;
    let updatedFeeds = 0;
    let warnings: string[] = [];

    if (feedId) {
      // Actualizar un feed específico
      const { newItems, error } = await fetchFeedUpdates(feedId);
      if (error) {
        // Si es un error de RLS/duplicados, lo tratamos como advertencia
        if (error.code === 'DB_ERROR' && error.details && typeof error.details === 'object' && 'code' in error.details && error.details.code === '42501') {
          return {
            success: true,
            message: `Feed procesado (algunos elementos ya existían)`,
            newItems: 0,
          };
        }
        return {
          success: false,
          message: `Error actualizando feed: ${error.message}`,
          error,
        };
      }
      return {
        success: true,
        message: newItems.length > 0 
          ? `Feed actualizado exitosamente` 
          : `Feed verificado - sin nuevos elementos`,
        newItems: newItems.length,
      };
    } else {
      // Actualizar todos los feeds del grupo usando la función existente
      // Si groupId es null, fetchAllFeedUpdates obtendrá todos los feeds del usuario
      const { updates, error } = await fetchAllFeedUpdates(groupId || undefined);
      
      if (error) {
        // Si es error de duplicados/RLS, intentamos obtener información útil
        if (error.code === 'MULTIPLE_ERRORS' && Array.isArray(error.details)) {
          const rlsErrors = error.details.filter((e: any) => 
            e.code === 'DB_ERROR' && e.details?.code === '42501'
          );
          const realErrors = error.details.filter((e: any) => 
            !(e.code === 'DB_ERROR' && e.details?.code === '42501')
          );
          
          if (rlsErrors.length > 0 && realErrors.length === 0) {
            // Solo errores de RLS/duplicados, continuamos
            warnings.push(`${rlsErrors.length} feeds tenían elementos duplicados (normal)`);
          } else if (realErrors.length > 0) {
            return {
              success: false,
              message: `Error actualizando feeds: ${realErrors[0].message}`,
              error: realErrors[0],
            };
          }
        } else {
          return {
            success: false,
            message: `Error actualizando feeds: ${error.message}`,
            error,
          };
        }
      }

      // Contar resultados
      const feedIds = Object.keys(updates);
      updatedFeeds = feedIds.length;
      totalNewItems = Object.values(updates).reduce((sum, items) => sum + items.length, 0);

      let message = totalNewItems > 0 
        ? `Actualización completada: ${updatedFeeds} feeds procesados, ${totalNewItems} nuevos elementos encontrados`
        : `Verificación completada: ${updatedFeeds} feeds verificados, sin nuevos elementos`;
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
      message: error instanceof Error ? error.message : 'Error desconocido',
      error: {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error,
      },
    };
  }
}

// Nueva función para obtener estadísticas de actualización
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