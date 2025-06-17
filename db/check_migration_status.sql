-- Script de Verificación del Estado de las Migraciones
-- Ejecuta este script para ver qué necesitas migrar

-- ============================================================================
-- VERIFICAR QUE ELEMENTOS YA EXISTEN
-- ============================================================================

-- 1. Verificar si existe la tabla user_profiles
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_profiles')
    THEN '✅ user_profiles table exists'
    ELSE '❌ user_profiles table MISSING - need to run migration'
  END as user_profiles_status;

-- 2. Verificar si existen las funciones RPC
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_group_members_with_profiles')
    THEN '✅ get_group_members_with_profiles function exists'
    ELSE '❌ get_group_members_with_profiles function MISSING'
  END as members_function_status;

SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_group_invitations_with_profiles')
    THEN '✅ get_group_invitations_with_profiles function exists'
    ELSE '❌ get_group_invitations_with_profiles function MISSING'
  END as invitations_function_status;

SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_email_exists')
    THEN '✅ check_email_exists function exists'
    ELSE '❌ check_email_exists function MISSING'
  END as email_check_function_status;

-- 3. Verificar trigger de sincronización
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sync_user_profile_trigger')
    THEN '✅ sync_user_profile_trigger exists'
    ELSE '❌ sync_user_profile_trigger MISSING'
  END as sync_trigger_status;

-- 4. Verificar políticas RLS críticas
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'user_group_members' 
      AND policyname = 'Users can see memberships in groups they own or belong to'
    )
    THEN '✅ Updated member visibility policy exists'
    ELSE '❌ Updated member visibility policy MISSING'
  END as member_policy_status;

-- 5. Contar usuarios existentes vs perfiles
SELECT 
  (SELECT COUNT(*) FROM auth.users) as total_users,
  (SELECT COUNT(*) FROM user_profiles) as total_profiles,
  CASE 
    WHEN (SELECT COUNT(*) FROM auth.users) = (SELECT COUNT(*) FROM user_profiles)
    THEN '✅ All users have profiles'
    ELSE '❌ Some users missing profiles - need migration'
  END as profile_sync_status;

-- ============================================================================
-- RESUMEN DE ACCIONES NECESARIAS
-- ============================================================================

SELECT 
  'RESUMEN: ' || 
  CASE 
    WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_profiles')
      OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_group_members_with_profiles')
      OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_group_invitations_with_profiles')
    THEN 'NECESITAS EJECUTAR database_migration_008_fix_member_management.sql'
    ELSE 'Todo parece estar en orden. Verifica que no hay errores 403 en la aplicación.'
  END as action_needed; 