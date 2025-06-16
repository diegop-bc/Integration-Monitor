import { supabase } from '../lib/supabase';
import { parseFeed } from '../utils/rssParser';
import type { FeedItem, FeedError } from '../types/feed';

const FETCH_INTERVAL = 2 * 60 * 60 * 1000; // 2 horas en millisegundos (cambiado de 15 minutos)

export async function fetchFeedUpdates(feedId: string): Promise<{ newItems: FeedItem[]; error?: FeedError }> {
  try {
    // Get the feed details
    const { data: feed, error: feedError } = await supabase
      .from('feeds')
      .select('*')
      .eq('id', feedId)
      .single();

    if (feedError || !feed) {
      return {
        newItems: [],
        error: {
          code: 'DB_ERROR',
          message: feedError?.message || 'Feed not found',
          details: feedError,
        },
      };
    }

    // Parse the feed
    const { items, error: parseError } = await parseFeed(
      feed.url,
      feed.integration_name,
      feed.integration_alias
    );

    if (parseError) {
      return { newItems: [], error: parseError };
    }

    // Get existing items
    const { data: existingItems, error: existingError } = await supabase
      .from('feed_items')
      .select('id')
      .eq('feed_id', feedId);

    if (existingError) {
      return {
        newItems: [],
        error: {
          code: 'DB_ERROR',
          message: existingError.message,
          details: existingError,
        },
      };
    }

    // Filter out existing items
    const existingIds = new Set(existingItems?.map((item: any) => item.id) || []);
    const newItems = items.filter(item => !existingIds.has(item.id));

    if (newItems.length > 0) {
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
        })), {
          onConflict: 'id',
          ignoreDuplicates: true
        });

      if (insertError) {
        // Si es un error de RLS pero los elementos ya existen, no es un error crítico
        if (insertError.code === '42501' || insertError.message.includes('row-level security')) {
          console.warn('RLS policy blocked some items (likely duplicates):', insertError.message);
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
      }
    }

    // Update last fetched timestamp
    await supabase
      .from('feeds')
      .update({ last_fetched: new Date().toISOString() })
      .eq('id', feedId);

    return { newItems };
  } catch (error) {
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

export async function fetchAllFeedUpdates(): Promise<{ updates: Record<string, FeedItem[]>; error?: FeedError }> {
  try {
    const { data: feeds, error: feedsError } = await supabase
      .from('feeds')
      .select('id');

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
export async function forceManualUpdate(feedId?: string): Promise<{ success: boolean; message: string; newItems?: number; error?: FeedError }> {
  try {
    // Detectar si estamos en desarrollo o producción
    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (isDevelopment) {
      // En desarrollo, usar las funciones directamente
      return await forceManualUpdateDirect(feedId);
    } else {
      // En producción, usar la API route
      return await forceManualUpdateAPI(feedId);
    }
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
async function forceManualUpdateDirect(feedId?: string): Promise<{ success: boolean; message: string; newItems?: number; error?: FeedError }> {
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
      // Actualizar todos los feeds usando la función existente
      const { updates, error } = await fetchAllFeedUpdates();
      
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

// Función para actualización via API (producción)
async function forceManualUpdateAPI(feedId?: string): Promise<{ success: boolean; message: string; newItems?: number; error?: FeedError }> {
  try {
    const response = await fetch('/api/manual-update-feeds', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        feedId: feedId || undefined,
        updateAll: !feedId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.error || 'Error desconocido',
        error: {
          code: 'API_ERROR',
          message: data.error,
          details: data,
        },
      };
    }

    if (feedId) {
      return {
        success: data.result?.success || false,
        message: data.message || 'Actualización completada',
        newItems: data.result?.newItems || 0,
      };
    } else {
      return {
        success: true,
        message: data.message || 'Actualización masiva completada',
        newItems: data.totalNewItems || 0,
      };
    }
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