# Optimización de Queries RSS

## Problema Identificado

El usuario reportó que veía muchas peticiones para feeds que no correspondían al contexto actual (feed personal o grupo actual). Esto causaba:

- Peticiones innecesarias a la base de datos
- Tráfico de red redundante
- Posible confusión en la consola de desarrollo
- Consumo innecesario de recursos

## Soluciones Implementadas

### 1. Invalidaciones de Query Exactas

**Antes:**
```typescript
queryClient.invalidateQueries({ queryKey: ['feeds', user?.id, 'personal'] })
```

**Después:**
```typescript
queryClient.invalidateQueries({ 
  queryKey: ['feeds', user?.id, 'personal'],
  exact: true 
})
```

**Beneficio:** Solo invalida la query específica, no todas las queries que coincidan parcialmente.

### 2. Hook useFeedUpdates Contextualizado

**Antes:**
```typescript
export function useFeedUpdates(feedId?: string)
```

**Después:**
```typescript
export function useFeedUpdates(feedId?: string, contextId?: string | null)
```

**Beneficio:** Permite especificar el contexto (personal=null, grupo=groupId) para evitar actualizaciones globales.

### 3. Uso Específico por Componente

#### Dashboard (Feeds Personales)
```typescript
useFeedUpdates(undefined, null) // null = contexto personal
```

#### GroupDashboard (Feeds del Grupo)
```typescript
useFeedUpdates(undefined, currentGroup?.id) // ID específico del grupo
```

#### UnifiedFeed (Contexto Dinámico)
```typescript
useFeedUpdates(undefined, contextId) // contextId se determina por la URL
```

## Estructura de Query Keys

Para mantener consistencia y evitar conflictos:

### Feeds Personales
```typescript
['feeds', userId, 'personal']
['allFeedItems', userId, 'personal']
```

### Feeds de Grupo
```typescript
['feeds', userId, groupId]
['allFeedItems', userId, groupId]
```

### Otros Recursos
```typescript
['group-members', groupId]
['group-invitations', groupId]
['publicGroupFeeds', groupId]
['publicGroupItems', groupId]
```

## Validación de Cambios

Para verificar que las optimizaciones funcionan:

1. **Abrir Developer Tools** (F12)
2. **Ir a la pestaña Network**
3. **Navegar entre feeds personales y grupos**
4. **Verificar que solo se hacen peticiones relevantes al contexto actual**

### Logs Esperados

En modo desarrollo, deberías ver logs como:
```
🌐 [Debug] Iniciando parseo de feed: [Contexto Correcto]
🔧 [Debug] Información del entorno: {isDevelopment: true}
```

**NO** deberías ver peticiones para:
- Feeds de grupos cuando estás en modo personal
- Feeds personales cuando estás viendo un grupo específico
- Múltiples queries simultáneas para el mismo recurso

## Mejoras Futuras

1. **Cache Inteligente**: Implementar cache strategies más sofisticadas
2. **Prefetching**: Precargar datos relevantes basado en la navegación del usuario
3. **Optimistic Updates**: Actualizar la UI inmediatamente sin esperar la respuesta del servidor
4. **Query Deduplication**: Evitar peticiones duplicadas automáticamente

## Monitoreo

Para monitorear el rendimiento:

1. **React Query DevTools** en desarrollo
2. **Network Tab** en DevTools para verificar peticiones
3. **Console logs** específicos para debugging
4. **Performance Tab** para análisis de rendimiento

## Configuración Avanzada

Si necesitas ajustar el comportamiento:

```typescript
// En App.tsx - QueryClient config
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutos
      retry: 2,
      refetchOnWindowFocus: false, // Evitar refetch automático
    },
  },
})
``` 