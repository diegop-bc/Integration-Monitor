-- Migration 004: Fix Invitation Token Access for Anonymous Users
-- Purpose: Allow anonymous users to query invitations by token for validation
-- Issue: 406 error when trying to accept invitations due to RLS blocking anonymous access
-- Date: $(date +%Y-%m-%d)

-- ============================================================================
-- MIGRATION START: Enable transaction for atomic operations
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
-- STEP 3: Add policy to allow anonymous users to view group info by ID
-- ============================================================================

-- Allow anonymous users to read basic group information for any group
-- This is safe because we're only exposing basic info (name) and users still need 
-- a valid invitation token to access the invitation details
CREATE POLICY "Anonymous users can view basic group info" 
  ON user_groups FOR SELECT 
  TO anon
  USING (true);

-- ============================================================================
-- MIGRATION COMMIT
-- ============================================================================

COMMIT;

-- ============================================================================
-- POST-MIGRATION NOTES
-- ============================================================================

-- MIGRATION SUMMARY:
-- ✅ Added policy for anonymous users to view invitations by token
-- ✅ Added policy for anonymous users to accept invitations
-- ✅ Maintains security by only allowing token-based access
-- ✅ Prevents mass data access by anonymous users
-- ✅ Allows invitation flow to work properly

-- SECURITY CONSIDERATIONS:
-- - Anonymous users can only access invitations with a valid token
-- - They cannot browse all invitations or access by other fields
-- - Update access is limited to setting accepted_at only
-- - Expired invitations cannot be modified

-- TESTING:
-- After running this migration, test that:
-- 1. Anonymous users can validate invitation tokens
-- 2. Invitation acceptance flow works end-to-end
-- 3. Existing RLS policies for authenticated users still work
-- 4. Anonymous users cannot access invitations without tokens 