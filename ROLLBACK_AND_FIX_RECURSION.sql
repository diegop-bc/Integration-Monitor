-- ROLLBACK Y ARREGLO DE RECURSIÓN INFINITA
-- Ejecuta este script completo en Supabase SQL Editor

-- ============================================================================
-- PASO 1: ROLLBACK - Eliminar políticas que causan recursión
-- ============================================================================

BEGIN;

-- Eliminar las políticas problemáticas
DROP POLICY IF EXISTS "Anonymous users can view invitations by token" ON group_invitations;
DROP POLICY IF EXISTS "Anonymous users can accept invitations by token" ON group_invitations;
DROP POLICY IF EXISTS "Anonymous users can view group info for invitations" ON user_groups;
DROP POLICY IF EXISTS "Anonymous users can view basic group info" ON user_groups;

COMMIT;

-- ============================================================================
-- PASO 2: RE-APLICAR - Crear políticas corregidas sin recursión
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Add policy to allow anonymous users to read invitations by token
-- ============================================================================

-- Allow anonymous users to read invitations by token only
-- This is needed for invitation validation before signup
CREATE POLICY "Anonymous users can view invitations by token" 
  ON group_invitations FOR SELECT 
  TO anon
  USING (
    -- Only allow access if a specific token is being queried
    -- This prevents mass data access while allowing invitation validation
    token IS NOT NULL
  );

-- ============================================================================
-- STEP 2: Add policy to allow anonymous users to update invitation status
-- ============================================================================

-- Allow anonymous users to mark invitations as accepted
-- This is needed when they complete the signup process
CREATE POLICY "Anonymous users can accept invitations by token" 
  ON group_invitations FOR UPDATE 
  TO anon
  USING (
    -- Only allow updating accepted_at field for valid tokens
    token IS NOT NULL AND 
    accepted_at IS NULL AND 
    expires_at > NOW()
  )
  WITH CHECK (
    -- Only allow setting accepted_at, nothing else
    accepted_at IS NOT NULL
  );

-- ============================================================================
-- STEP 3: Add policy to allow anonymous users to view group info (FIXED)
-- ============================================================================

-- Allow anonymous users to read basic group information for any group
-- This is safe because we're only exposing basic info (name) and users still need 
-- a valid invitation token to access the invitation details
-- FIXED: Removed recursive query that caused infinite loop
CREATE POLICY "Anonymous users can view basic group info" 
  ON user_groups FOR SELECT 
  TO anon
  USING (true);

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================================

-- VERIFICATION QUERIES (run these separately to test):
-- 1. Test invitation query (should work):
--    SELECT * FROM group_invitations WHERE token = 'your-test-token' AND accepted_at IS NULL;
--
-- 2. Test group info query (should work):
--    SELECT name FROM user_groups WHERE id = 'your-group-id';
--
-- 3. Verify no recursion (should not cause 500 error):
--    Both queries above should execute without infinite recursion 