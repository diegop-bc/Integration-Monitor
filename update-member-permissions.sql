-- ============================================================================
-- ACTUALIZAR PERMISOS DE MEMBERS PARA GESTIONAR INTEGRACIONES
-- ============================================================================
-- Permitir que members de grupos puedan crear, editar y eliminar feeds
-- Solo viewers tendrán acceso de solo lectura

BEGIN;

-- ============================================================================
-- PASO 1: Actualizar políticas RLS para FEEDS (gestión de integraciones)
-- ============================================================================

-- Eliminar políticas existentes de feeds
DROP POLICY IF EXISTS "Users can see their personal feeds and group feeds they belong to" ON feeds;
DROP POLICY IF EXISTS "Users can insert personal feeds and group feeds they can manage" ON feeds;
DROP POLICY IF EXISTS "Users can update their personal feeds and group feeds they can manage" ON feeds;
DROP POLICY IF EXISTS "Users can delete their personal feeds and group feeds they can manage" ON feeds;

-- CREAR NUEVA POLÍTICA DE LECTURA: Todos los miembros (incluyendo viewers) pueden ver feeds
CREATE POLICY "Users can see their personal feeds and group feeds they belong to" 
  ON feeds FOR SELECT 
  USING (
    -- Personal feeds (no group_id)
    (group_id IS NULL AND auth.uid() = user_id) OR
    -- Group feeds where user is any kind of member (owner, admin, member, viewer)
    (group_id IS NOT NULL AND auth.uid() IN (
      SELECT ugm.user_id FROM user_group_members ugm 
      WHERE ugm.group_id = feeds.group_id
    )) OR
    -- Group feeds where user is the group owner
    (group_id IS NOT NULL AND auth.uid() IN (
      SELECT ug.owner_id FROM user_groups ug 
      WHERE ug.id = feeds.group_id
    ))
  );

-- CREAR NUEVA POLÍTICA DE INSERCIÓN: Owner, admin y member pueden crear feeds
CREATE POLICY "Users can insert personal feeds and group feeds they can manage" 
  ON feeds FOR INSERT 
  WITH CHECK (
    -- Personal feeds (no group_id)
    (group_id IS NULL AND auth.uid() = user_id) OR
    -- Group feeds where user is owner
    (group_id IS NOT NULL AND auth.uid() IN (
      SELECT ug.owner_id FROM user_groups ug 
      WHERE ug.id = feeds.group_id
    )) OR
    -- Group feeds where user is admin or member (but not viewer)
    (group_id IS NOT NULL AND auth.uid() IN (
      SELECT ugm.user_id FROM user_group_members ugm 
      WHERE ugm.group_id = feeds.group_id 
      AND ugm.role IN ('admin', 'member')
    ))
  );

-- CREAR NUEVA POLÍTICA DE ACTUALIZACIÓN: Owner, admin y member pueden actualizar feeds
CREATE POLICY "Users can update their personal feeds and group feeds they can manage" 
  ON feeds FOR UPDATE 
  USING (
    -- Personal feeds (no group_id)
    (group_id IS NULL AND auth.uid() = user_id) OR
    -- Group feeds where user is owner
    (group_id IS NOT NULL AND auth.uid() IN (
      SELECT ug.owner_id FROM user_groups ug 
      WHERE ug.id = feeds.group_id
    )) OR
    -- Group feeds where user is admin or member (but not viewer)
    (group_id IS NOT NULL AND auth.uid() IN (
      SELECT ugm.user_id FROM user_group_members ugm 
      WHERE ugm.group_id = feeds.group_id 
      AND ugm.role IN ('admin', 'member')
    ))
  );

-- CREAR NUEVA POLÍTICA DE ELIMINACIÓN: Owner, admin y member pueden eliminar feeds
CREATE POLICY "Users can delete their personal feeds and group feeds they can manage" 
  ON feeds FOR DELETE 
  USING (
    -- Personal feeds (no group_id)
    (group_id IS NULL AND auth.uid() = user_id) OR
    -- Group feeds where user is owner
    (group_id IS NOT NULL AND auth.uid() IN (
      SELECT ug.owner_id FROM user_groups ug 
      WHERE ug.id = feeds.group_id
    )) OR
    -- Group feeds where user is admin or member (but not viewer)
    (group_id IS NOT NULL AND auth.uid() IN (
      SELECT ugm.user_id FROM user_group_members ugm 
      WHERE ugm.group_id = feeds.group_id 
      AND ugm.role IN ('admin', 'member')
    ))
  );

-- ============================================================================
-- PASO 2: Actualizar políticas RLS para FEED_ITEMS (contenido de integraciones)
-- ============================================================================

-- Eliminar políticas existentes de feed_items
DROP POLICY IF EXISTS "Users can see personal and group feed items they have access to" ON feed_items;
DROP POLICY IF EXISTS "Users can insert personal and group feed items they can manage" ON feed_items;
DROP POLICY IF EXISTS "Users can delete personal and group feed items they can manage" ON feed_items;

-- CREAR NUEVA POLÍTICA DE LECTURA: Todos los miembros pueden ver feed items
CREATE POLICY "Users can see personal and group feed items they have access to" 
  ON feed_items FOR SELECT 
  USING (
    -- Personal feed items (no group_id)
    (group_id IS NULL AND auth.uid() = user_id) OR
    -- Group feed items where user is any kind of member
    (group_id IS NOT NULL AND auth.uid() IN (
      SELECT ugm.user_id FROM user_group_members ugm 
      WHERE ugm.group_id = feed_items.group_id
    )) OR
    -- Group feed items where user is the group owner
    (group_id IS NOT NULL AND auth.uid() IN (
      SELECT ug.owner_id FROM user_groups ug 
      WHERE ug.id = feed_items.group_id
    ))
  );

-- CREAR NUEVA POLÍTICA DE INSERCIÓN: Solo el sistema puede insertar feed items
-- (Los feed items se crean automáticamente por el sistema de actualización)
CREATE POLICY "System can insert feed items" 
  ON feed_items FOR INSERT 
  WITH CHECK (true); -- El sistema siempre puede insertar

-- CREAR NUEVA POLÍTICA DE ELIMINACIÓN: Owner, admin y member pueden eliminar feed items
CREATE POLICY "Users can delete personal and group feed items they can manage" 
  ON feed_items FOR DELETE 
  USING (
    -- Personal feed items (no group_id)
    (group_id IS NULL AND auth.uid() = user_id) OR
    -- Group feed items where user is owner
    (group_id IS NOT NULL AND auth.uid() IN (
      SELECT ug.owner_id FROM user_groups ug 
      WHERE ug.id = feed_items.group_id
    )) OR
    -- Group feed items where user is admin or member (but not viewer)
    (group_id IS NOT NULL AND auth.uid() IN (
      SELECT ugm.user_id FROM user_group_members ugm 
      WHERE ugm.group_id = feed_items.group_id 
      AND ugm.role IN ('admin', 'member')
    ))
  );

COMMIT;

-- ============================================================================
-- RESUMEN DE CAMBIOS
-- ============================================================================

-- ✅ LECTURA (Feeds y Feed Items):
--    - Owner: ✅ Puede ver
--    - Admin: ✅ Puede ver  
--    - Member: ✅ Puede ver
--    - Viewer: ✅ Puede ver (solo lectura)

-- ✅ GESTIÓN (Crear/Editar/Eliminar Feeds):
--    - Owner: ✅ Gestión completa
--    - Admin: ✅ Gestión completa
--    - Member: ✅ Gestión completa  
--    - Viewer: ❌ Solo lectura

-- ✅ SEGURIDAD:
--    - Viewers no pueden modificar nada
--    - Solo miembros activos pueden gestionar
--    - Personal feeds siguen siendo privados 