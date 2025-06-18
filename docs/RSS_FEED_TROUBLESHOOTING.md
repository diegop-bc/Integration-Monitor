# Solución de Problemas - Feeds RSS y CORS

## Problema: Rate Limit de corsproxy.io

Si recibes el error:
```
Rate limit reached. Please create an account at https://accounts.corsproxy.io
```

Esto significa que has alcanzado el límite de requests gratuitos del servicio corsproxy.io.

## Soluciones Implementadas

### 1. Múltiples Proxies CORS (Desarrollo)

La aplicación ahora intenta múltiples servicios de proxy CORS en orden:

1. **api.allorigins.win/raw** - Proxy gratuito, sin límites estrictos
2. **api.codetabs.com/v1/proxy** - Proxy alternativo
3. **corsproxy.io** - Servicio original (como fallback)
4. **api.allorigins.win/get** - Versión JSON del primer proxy

### 2. Función Serverless (Producción)

En producción, la aplicación usa funciones serverless de Vercel que no tienen problemas de CORS.

## Configuración de Desarrollo Local

### Opción A: Usar los Proxies Múltiples (Recomendado)

La aplicación automáticamente detecta si estás en desarrollo y usará los múltiples proxies.

### Opción B: Configurar tu Propio Proxy CORS

Si quieres usar tu propio proxy CORS, puedes:

1. **Instalar cors-anywhere localmente:**

```bash
npm install -g cors-anywhere
cors-anywhere
```

Luego edita `src/config/environment.ts` y agrega:
```typescript
'http://localhost:8080/',
```

2. **Usar extensión de navegador:**

Instala una extensión como "CORS Unblock" en Chrome/Firefox.

### Opción C: Deshabilitar CORS en el Navegador (Solo para Desarrollo)

**⚠️ NO recomendado para uso general**

Para Chrome:
```bash
google-chrome --user-data-dir="/tmp/chrome_dev_test" --disable-web-security --disable-features=VizDisplayCompositor
```

## Verificar Configuración

Para verificar que todo funciona correctamente:

1. Abre las Developer Tools (F12)
2. Ve a la pestaña Console
3. Agrega un feed RSS
4. Deberías ver logs como:

```
🌐 [Debug] Iniciando parseo de feed: NombreIntegración - https://ejemplo.com/feed.rss
🔧 [Debug] Información del entorno: {isDevelopment: true, hostname: "localhost", ...}
🚀 [Debug] Modo desarrollo: probando 4 proxies CORS...
🔗 [Debug] Intentando proxy 1/4: https://api.allorigins.win/raw?url=
✅ [Debug] Proxy exitoso: https://api.allorigins.win/raw?url=
📄 [Debug] Contenido XML obtenido vía proxy CORS: 12345 caracteres
✅ [Debug] Parseo completado exitosamente vía proxy: 15 items parseados
```

## Feeds RSS Recomendados para Pruebas

Algunos feeds RSS públicos que funcionan bien para pruebas:

- **GitHub Blog:** `https://github.blog/feed/`
- **Vercel Blog:** `https://vercel.com/blog/rss.xml`
- **CSS-Tricks:** `https://css-tricks.com/feed/`
- **Smashing Magazine:** `https://www.smashingmagazine.com/feed/`

## Solución de Problemas Comunes

### Error: "All CORS proxies failed"

1. Verifica tu conexión a internet
2. Confirma que el feed RSS es válido
3. Prueba con un feed RSS diferente
4. Revisa la consola del navegador para errores específicos

### Error: "Request timeout"

El timeout está configurado a 30 segundos. Si tu feed tarda más:

1. Verifica que la URL del feed sea correcta
2. El servidor del feed puede estar lento
3. Prueba más tarde

### Feed no se actualiza

1. Verifica que el feed tenga nuevos elementos
2. Revisa la fecha de `lastFetched` en tu dashboard
3. Usa el botón "Refresh Feeds" para forzar una actualización

## Reportar Problemas

Si ninguna de estas soluciones funciona:

1. Abre las Developer Tools
2. Copia todos los logs de la consola
3. Incluye la URL del feed que estás intentando agregar
4. Reporta el issue con esta información

## Configuración Avanzada

Para desarrolladores que quieran modificar la configuración:

Edita `src/config/environment.ts`:

```typescript
export const ENV_CONFIG = {
  // Aumentar timeout si tienes feeds lentos
  fetchTimeout: 60000, // 60 segundos
  
  // Aumentar delay entre reintentos
  retryDelay: 2000, // 2 segundos
  
  // Agregar proxies personalizados
  corsProxies: [
    'tu-proxy-personalizado.com/?url=',
    ...ENV_CONFIG.corsProxies
  ],
};
``` 