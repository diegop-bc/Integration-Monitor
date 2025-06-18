import type { FeedItem, FeedError } from '../types/feed';
import { sanitizeHtmlToText } from './textSanitizer';
import { ENV_CONFIG, getEnvironmentInfo } from '../config/environment';

// Función para crear un timeout para fetch requests
function fetchWithTimeout(url: string, options: RequestInit = {}, timeout: number = ENV_CONFIG.fetchTimeout): Promise<Response> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);

    fetch(url, { ...options, signal: controller.signal })
      .then(response => {
        clearTimeout(timeoutId);
        resolve(response);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

async function parseRSSContent(
  xmlContent: string, 
  url: string, 
  integrationName: string, 
  integrationAlias?: string,
  feedId?: string
): Promise<FeedItem[]> {
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

    // Crear ID compuesto con feed ID si está disponible
    const composedId = feedId ? `${feedId}-${guid}` : guid;

    // Sanitize HTML content to plain text
    const sanitizedContent = sanitizeHtmlToText(content);
    const sanitizedDescription = sanitizeHtmlToText(description);

    items.push({
      id: composedId,
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

// Función para probar múltiples proxies CORS
async function fetchWithCorsProxies(url: string): Promise<Response> {
  const errors: string[] = [];
  const proxies = ENV_CONFIG.corsProxies;
  
  for (let i = 0; i < proxies.length; i++) {
    const proxy = proxies[i];
    try {
      console.log(`🔗 [Debug] Intentando proxy ${i + 1}/${proxies.length}: ${proxy}`);
      
      let proxyUrl: string;
      if (proxy.includes('allorigins.win/get')) {
        // Para allorigins con respuesta JSON
        proxyUrl = `${proxy}${encodeURIComponent(url)}`;
        const response = await fetchWithTimeout(proxyUrl);
        if (response.ok) {
          const data = await response.json();
          if (data.contents) {
            // Crear una respuesta simulada con el contenido
            console.log(`✅ [Debug] Proxy exitoso (JSON): ${proxy}`);
            return new Response(data.contents, { status: 200, statusText: 'OK' });
          }
        }
        throw new Error(`HTTP ${response.status}`);
      } else {
        // Para otros proxies que devuelven contenido directo
        proxyUrl = `${proxy}${encodeURIComponent(url)}`;
        const response = await fetchWithTimeout(proxyUrl);
        if (response.ok) {
          console.log(`✅ [Debug] Proxy exitoso: ${proxy}`);
          return response;
        }
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      const errorMsg = `Proxy ${i + 1} (${proxy}) falló: ${error instanceof Error ? error.message : 'Error desconocido'}`;
      console.error(`❌ [Debug] ${errorMsg}`);
      errors.push(errorMsg);
      
      // Pequeña pausa entre intentos para evitar spam
      if (i < proxies.length - 1) {
        await new Promise(resolve => setTimeout(resolve, ENV_CONFIG.retryDelay));
      }
    }
  }
  
  throw new Error(`Todos los proxies CORS fallaron:\n${errors.join('\n')}`);
}

export async function parseFeed(
  url: string, 
  integrationName: string, 
  integrationAlias?: string, 
  feedId?: string
): Promise<{ items: FeedItem[]; error?: FeedError }> {
  try {
    const envInfo = getEnvironmentInfo();
    console.log(`🌐 [Debug] Iniciando parseo de feed: ${integrationName} - ${url}`);
    console.log(`🔧 [Debug] Información del entorno:`, envInfo);
    
    if (envInfo.isDevelopment) {
      // En desarrollo, usar proxies CORS con múltiples alternativas
      console.log(`🚀 [Debug] Modo desarrollo: probando ${envInfo.availableProxies} proxies CORS...`);
      
      try {
        const response = await fetchWithCorsProxies(url);
        const xmlContent = await response.text();
        console.log(`📄 [Debug] Contenido XML obtenido vía proxy CORS: ${xmlContent.length} caracteres`);
        
        // Mostrar una muestra del contenido XML para debug
        if (xmlContent.length > 0) {
          const xmlSample = xmlContent.substring(0, 500) + (xmlContent.length > 500 ? '...' : '');
          console.log(`🔎 [Debug] Muestra del XML:`, xmlSample);
        }
        
        const items = await parseRSSContent(xmlContent, url, integrationName, integrationAlias, feedId);
        console.log(`✅ [Debug] Parseo completado exitosamente vía proxy: ${items.length} items parseados`);
        return { items };
      } catch (proxyError) {
        console.error(`❌ [Debug] Todos los proxies CORS fallaron, intentando fetch directo...`);
        
        // Fallback: try direct fetch (might work for some feeds with CORS headers)
        try {
          const directResponse = await fetchWithTimeout(url);
          if (!directResponse.ok) {
            throw new Error(`HTTP ${directResponse.status}: ${directResponse.statusText}`);
          }
          const xmlContent = await directResponse.text();
          console.log(`📄 [Debug] Contenido XML obtenido vía fetch directo: ${xmlContent.length} caracteres`);
          const items = await parseRSSContent(xmlContent, url, integrationName, integrationAlias, feedId);
          console.log(`✅ [Debug] Parseo completado exitosamente vía fetch directo: ${items.length} items parseados`);
          return { items };
        } catch (directError) {
          throw new Error(`Proxies CORS y fetch directo fallaron. Proxy error: ${proxyError}. Direct error: ${directError}`);
        }
      }
    } else {
      // En producción, usar la función serverless
      console.log(`🏭 [Debug] Modo producción: usando función serverless /api/parse-feed`);
      
      const response = await fetchWithTimeout('/api/parse-feed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          integrationName,
          integrationAlias,
          feedId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [Debug] Error en función serverless:`, errorText);
        
        try {
          const errorData = await response.json();
          return {
            items: [],
            error: errorData.error || {
              code: 'NETWORK_ERROR',
              message: `HTTP ${response.status}: ${response.statusText}`,
            },
          };
        } catch {
          return {
            items: [],
            error: {
              code: 'NETWORK_ERROR',
              message: `HTTP ${response.status}: ${errorText}`,
            },
          };
        }
      }

      const data = await response.json();
      console.log(`✅ [Debug] Función serverless exitosa: ${data.items?.length || 0} items parseados`);
      return { items: data.items };
    }
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