-- Migration 015: Fix Group Feed Insert Policy
-- Purpose: Allow group owners and admins to create feeds in their groups
-- Issue: feeds_insert_policy has incorrect condition that prevents group owners from creating feeds
-- Date: 2024-01-XX

BEGIN;

-- ============================================================================
-- STEP 1: Fix the INSERT policy for feeds
-- ============================================================================

-- Drop the problematic insert policy
DROP POLICY IF EXISTS "feeds_insert_policy" ON feeds;

-- Create corrected policy that allows group owners and admins to create feeds
CREATE POLICY "feeds_insert_policy" 
  ON feeds FOR INSERT 
  WITH CHECK (
    -- Personal feeds (no group_id) - user must be the owner
    (group_id IS NULL AND auth.uid() = user_id) OR
    -- Group feeds - user must be group owner, admin, or member (but not viewer)
    (group_id IS NOT NULL AND (
      -- User is group owner
      auth.uid() IN (
        SELECT ug.owner_id FROM user_groups ug 
        WHERE ug.id = group_id
      ) OR
      -- User is admin or member in the group
      auth.uid() IN (
        SELECT ugm.user_id FROM user_group_members ugm 
        WHERE ugm.group_id = group_id 
        AND ugm.role IN ('admin', 'member')
      )
    ))
  );

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================================

-- Test these queries after applying the migration:

-- 1. Check what policies are now active for feeds:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
-- FROM pg_policies 
-- WHERE tablename = 'feeds' AND cmd = 'INSERT';

-- 2. Test group owner can create feed (replace UUIDs with actual values):
-- INSERT INTO feeds (url, title, integration_name, user_id, group_id) 
-- VALUES ('https://test.com/feed.rss', 'Test Feed', 'Test Integration', auth.uid(), '<group_id>');

-- ============================================================================
-- SUMMARY OF FIX
-- ============================================================================

-- ❌ BEFORE: feeds_insert_policy required (auth.uid() = user_id) AND group permissions
--    This prevented group owners from creating feeds because user_id could be different

-- ✅ AFTER: feeds_insert_policy allows group owners/admins to create feeds regardless of user_id
--    Personal feeds still require auth.uid() = user_id
--    Group feeds only require group ownership/admin/member permissions 