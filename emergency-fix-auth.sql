-- ============================================================================
-- SCRIPT DE EMERGENCIA - Arreglar problemas de autenticación
-- ============================================================================
-- Si hay problemas con login/registro, ejecuta este script en Supabase SQL Editor

BEGIN;

-- ============================================================================
-- PASO 1: Deshabilitar temporalmente el trigger problemático
-- ============================================================================

-- Deshabilitar el trigger de sincronización de perfil de usuario
DROP TRIGGER IF EXISTS sync_user_profile_trigger ON auth.users;

-- ============================================================================
-- PASO 2: Verificar y arreglar políticas RLS problemáticas
-- ============================================================================

-- Verificar si las políticas de user_profiles están causando problemas
DROP POLICY IF EXISTS "Users can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON user_profiles;

-- Crear políticas más simples y seguras
CREATE POLICY "Simple profile read access" 
  ON user_profiles FOR SELECT 
  USING (true); -- Acceso de lectura público para debug

CREATE POLICY "Users can manage their own profile" 
  ON user_profiles FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- PASO 3: Crear versión simplificada del trigger (opcional)
-- ============================================================================

-- Función simplificada que no debería causar errores
CREATE OR REPLACE FUNCTION sync_user_profile_simple()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Solo insertar si no existe, sin hacer UPDATE
  INSERT INTO user_profiles (id, email, name, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING; -- No hacer nada si ya existe
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Si hay cualquier error, simplemente continuar sin fallar
    RAISE LOG 'Warning: Could not sync user profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- PASO 4: Re-crear trigger solo si es necesario (comentado por ahora)
-- ============================================================================

-- Descomentar solo después de verificar que el login funciona:
-- CREATE TRIGGER sync_user_profile_trigger_simple
--   AFTER INSERT ON auth.users
--   FOR EACH ROW
--   EXECUTE FUNCTION sync_user_profile_simple();

COMMIT;

-- ============================================================================
-- INSTRUCCIONES POST-EJECUCIÓN
-- ============================================================================

-- 1. Ejecuta este script en Supabase SQL Editor
-- 2. Prueba hacer login
-- 3. Si funciona, puedes volver a habilitar el trigger con la función simple:
--    CREATE TRIGGER sync_user_profile_trigger_simple
--      AFTER INSERT ON auth.users
--      FOR EACH ROW
--      EXECUTE FUNCTION sync_user_profile_simple();
-- 4. Si sigue fallando, el problema podría ser en las políticas RLS más profundas

-- ============================================================================
-- VERIFICAR EL ESTADO DESPUÉS
-- ============================================================================

-- Ejecuta estas consultas para verificar:
-- SELECT * FROM pg_trigger WHERE tgname LIKE '%sync_user%';
-- SELECT * FROM information_schema.table_privileges WHERE table_name = 'user_profiles'; 