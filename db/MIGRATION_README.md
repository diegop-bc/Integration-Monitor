# Migraciones de Base de Datos - Integration Monitor

## Problema Identificado

El sistema está fallando al intentar obtener información de usuarios porque está usando `supabase.auth.admin.getUserById()` desde el frontend, lo cual requiere privilegios de administrador que no están disponibles.

**Error típico:**
```
GET | 403 | auth/v1/admin/users/USER_ID
x_sb_error_code: "not_admin"
```

## Solución Implementada

Hemos creado una tabla de perfiles de usuario y funciones RPC que se ejecutan con privilegios elevados para obtener información de usuarios sin usar `auth.admin`.

## Migraciones a Aplicar

### 1. Migración 006: Tabla de Perfiles y Funciones RPC
**Archivo:** `database_migration_006_add_user_profiles.sql`

Esta migración crea:
- Tabla `user_profiles` para almacenar información básica de usuarios
- Función RPC `get_group_members_with_profiles()` para obtener miembros con sus perfiles
- Función RPC `get_group_invitations_with_profiles()` para obtener invitaciones con información del invitador
- Función RPC `check_email_exists()` para verificar si un email existe
- Trigger automático para sincronizar perfiles cuando se crea/actualiza un usuario

### 2. Migración 007: Corrección de Permisos
**Archivo:** `database_migration_007_fix_member_permissions.sql`

Esta migración corrige:
- Políticas RLS para que los propietarios puedan ver TODOS los miembros de sus grupos
- Políticas RLS para que los propietarios puedan ver TODAS las invitaciones de sus grupos
- Permisos apropiados para administradores de grupo

## Instrucciones de Aplicación

### Paso 1: Aplicar Migración 006
1. Ve al editor SQL de Supabase
2. Copia y pega todo el contenido de `database_migration_006_add_user_profiles.sql`
3. Ejecuta la migración

### Paso 2: Aplicar Migración 007
1. Ve al editor SQL de Supabase
2. Copia y pega todo el contenido de `database_migration_007_fix_member_permissions.sql`
3. Ejecuta la migración

### Paso 3: Verificar la Migración
Ejecuta estas consultas para verificar que todo funciona:

```sql
-- Verificar que la tabla de perfiles existe
SELECT COUNT(*) FROM user_profiles;

-- Probar función de miembros (reemplaza 'tu-group-id' con un ID real)
SELECT * FROM get_group_members_with_profiles('tu-group-id');

-- Probar función de invitaciones
SELECT * FROM get_group_invitations_with_profiles('tu-group-id');

-- Probar verificación de email
SELECT check_email_exists('test@example.com');
```

## Cambios en el Código

El `memberService.ts` ya ha sido actualizado para usar las nuevas funciones RPC en lugar de `auth.admin.getUserById()`.

### Antes:
```typescript
const { data: userProfile } = await supabase.auth.admin.getUserById(member.user_id);
```

### Después:
```typescript
const { data: members } = await supabase.rpc('get_group_members_with_profiles', { group_uuid: groupId });
```

## Beneficios de la Solución

1. **Elimina errores 403**: Ya no usa funciones de administrador desde el frontend
2. **Mejora rendimiento**: Una sola consulta RPC en lugar de múltiples llamadas a auth.admin
3. **Permisos correctos**: Los propietarios pueden ver todos los miembros e invitaciones
4. **Sincronización automática**: Los perfiles se actualizan automáticamente cuando cambian los metadatos del usuario
5. **Escalabilidad**: Funciona eficientemente incluso con muchos miembros

## Verificación Post-Migración

Después de aplicar las migraciones, verifica que:

1. ✅ Los propietarios pueden ver la lista completa de miembros
2. ✅ Los propietarios pueden ver todas las invitaciones pendientes
3. ✅ No hay más errores 403 en la consola
4. ✅ La información de usuarios (nombres, emails) se muestra correctamente
5. ✅ Los nuevos usuarios que se registren aparecen automáticamente en la tabla de perfiles

## Rollback (si es necesario)

Si necesitas revertir los cambios:

```sql
-- Revertir migración 007
DROP POLICY IF EXISTS "Users can see memberships in groups they own or belong to" ON user_group_members;
DROP POLICY IF EXISTS "Users can see invitations for groups they can manage" ON group_invitations;
-- ... etc

-- Revertir migración 006
DROP FUNCTION IF EXISTS get_group_members_with_profiles(UUID);
DROP FUNCTION IF EXISTS get_group_invitations_with_profiles(UUID);
DROP TABLE IF EXISTS user_profiles CASCADE;
``` 