// Configuración de entorno y proxies CORS
export const ENV_CONFIG = {
  // Detectar si estamos en desarrollo
  isDevelopment: process.env.NODE_ENV === 'development' || 
                (typeof window !== 'undefined' && 
                 (window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1' ||
                  window.location.protocol === 'file:')),

  // Lista de proxies CORS alternativos para desarrollo
  corsProxies: [
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://corsproxy.io/?',
    'https://api.allorigins.win/get?url=',
  ],

  // Configuración de timeouts
  fetchTimeout: 30000, // 30 segundos

  // Configuración de reintentos
  maxRetries: 3,
  retryDelay: 1000, // 1 segundo
};

// Función helper para detectar el entorno
export function getEnvironmentInfo() {
  return {
    isDevelopment: ENV_CONFIG.isDevelopment,
    hostname: typeof window !== 'undefined' ? window.location.hostname : 'server',
    nodeEnv: process.env.NODE_ENV || 'unknown',
    availableProxies: ENV_CONFIG.corsProxies.length,
  };
} 