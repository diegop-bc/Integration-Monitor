# Solución al Error de Feeds Duplicados

## 🔍 **Problema Identificado**

El error que estás viendo:
```
"duplicate key value violates unique constraint \"feeds_url_key\""
```

Ocurre porque la tabla `feeds` tiene una restricción `UNIQUE` en la columna `url`, lo que impide que diferentes usuarios puedan agregar el mismo feed RSS.

## 🎯 **Causa del Problema**

En el esquema inicial (`db/supabase-schema.sql` línea 12):
```sql
url TEXT NOT NULL UNIQUE,
```

Esta restricción es incorrecta para un sistema multi-usuario porque:
- ❌ Diferentes usuarios no pueden suscribirse al mismo feed RSS
- ❌ Diferentes grupos no pueden tener el mismo feed RSS
- ❌ Un usuario no puede tener el mismo feed tanto personal como en un grupo

## ✅ **Solución Implementada**

He creado una migración que:

1. **Elimina la restricción global** en `feeds.url`
2. **Agrega restricciones compuestas inteligentes**:
   - Los usuarios no pueden duplicar feeds en su colección personal
   - Los grupos no pueden duplicar feeds dentro del mismo grupo
   - Pero diferentes usuarios/grupos SÍ pueden tener el mismo feed
3. **Mejora el rendimiento** con índices optimizados

## 🚀 **Cómo Aplicar la Solución**

### Paso 1: Ejecutar la Migración

1. **Abre tu panel de Supabase**
2. **Ve a SQL Editor**
3. **Copia y pega** el contenido completo del archivo:
   ```
   db/migrations/database_migration_003_fix_unique_url_constraint.sql
   ```
4. **Ejecuta la migración** haciendo clic en "Run"

### Paso 2: Verificar que Funcionó

Después de ejecutar la migración, deberías ver mensajes como:
```
✅ No duplicate URLs found. Migration completed successfully.
✅ New constraints allow: Same feed URL for different users...
```

### Paso 3: Probar la Funcionalidad

Ahora puedes probar que:
- ✅ Usuario A puede agregar `https://ejemplo.com/feed.xml`
- ✅ Usuario B puede agregar el **mismo** `https://ejemplo.com/feed.xml`
- ✅ Diferentes grupos pueden agregar el mismo feed
- ❌ El mismo usuario no puede agregar el mismo feed twice (protección anti-spam)

## 🔧 **Cambios Técnicos Realizados**

### Antes (Problemático):
```sql
-- ❌ Restricción global que causaba el error
url TEXT NOT NULL UNIQUE
```

### Después (Solucionado):
```sql
-- ✅ Restricciones inteligentes
CREATE UNIQUE INDEX idx_feeds_unique_personal 
ON feeds (user_id, url) WHERE group_id IS NULL;

CREATE UNIQUE INDEX idx_feeds_unique_group 
ON feeds (group_id, url) WHERE group_id IS NOT NULL;
```

## 📊 **Beneficios de la Solución**

1. **✅ Multi-usuario funcional**: Diferentes usuarios pueden suscribirse al mismo feed
2. **✅ Prevención de spam**: Los usuarios no pueden duplicar feeds en su propia colección
3. **✅ Flexibilidad de grupos**: Los grupos pueden compartir feeds populares
4. **✅ Mejor rendimiento**: Índices optimizados para consultas por usuario/grupo
5. **✅ Integridad de datos**: Mantiene la consistencia sin ser restrictivo

## 🧪 **Cómo Probar**

### Caso de Prueba 1: Múltiples Usuarios
```
1. Usuario A agrega: https://github.blog/changelog/feed/
2. Usuario B agrega: https://github.blog/changelog/feed/ (mismo feed)
3. ✅ Ambos deberían funcionar sin error
```

### Caso de Prueba 2: Prevención de Duplicados
```
1. Usuario A agrega: https://stripe.com/blog/feed.xml
2. Usuario A intenta agregar nuevamente: https://stripe.com/blog/feed.xml
3. ❌ Debería mostrar error de duplicado (comportamiento correcto)
```

### Caso de Prueba 3: Grupos
```
1. Grupo X agrega: https://aws.amazon.com/about-aws/whats-new/recent/feed/
2. Grupo Y agrega: https://aws.amazon.com/about-aws/whats-new/recent/feed/
3. ✅ Ambos grupos deberían poder tener el mismo feed
```

## 🔄 **Si Necesitas Rollback**

Si por alguna razón necesitas revertir los cambios:

```sql
-- ⚠️ ROLLBACK SCRIPT (usar solo si es necesario)
BEGIN;

-- Eliminar las nuevas restricciones
DROP INDEX IF EXISTS idx_feeds_unique_personal;
DROP INDEX IF EXISTS idx_feeds_unique_group;
DROP INDEX IF EXISTS idx_feeds_url;
DROP INDEX IF EXISTS idx_feeds_user_url;
DROP INDEX IF EXISTS idx_feeds_group_url;

-- Restaurar restricción original (solo si no hay duplicados)
-- ALTER TABLE feeds ADD CONSTRAINT feeds_url_key UNIQUE (url);

COMMIT;
```

## 📝 **Próximos Pasos**

1. **Ejecuta la migración** siguiendo los pasos arriba
2. **Prueba** que diferentes usuarios pueden agregar el mismo feed
3. **Verifica** que el botón de actualización manual sigue funcionando
4. **Monitorea** que no hay otros errores relacionados

La solución está diseñada para ser **segura, eficiente y compatible** con tu sistema actual de polling automático cada 2 horas. 