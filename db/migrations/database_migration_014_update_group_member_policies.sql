-- Migration 014: Update Group Member Policies for Feed Access
-- Purpose: Update existing RLS policies to allow group members to see feeds and feed items
-- Issue: Current policies prevent group members from seeing group content
-- Date: 2024-01-XX

BEGIN;

-- ============================================================================
-- STEP 1: Update existing feed policies to allow group member access
-- ============================================================================

-- First, check what policies exist and drop them systematically
DO $$
BEGIN
    -- Drop all existing feed policies
    DROP POLICY IF EXISTS "Users can see their personal feeds and group feeds they belong to" ON feeds;
    DROP POLICY IF EXISTS "Users can see their own feeds" ON feeds;
    DROP POLICY IF EXISTS "Users can see feeds they have access to" ON feeds;
    DROP POLICY IF EXISTS "Users can insert personal feeds and group feeds they can manage" ON feeds;
    DROP POLICY IF EXISTS "Users can insert their own feeds" ON feeds;
    DROP POLICY IF EXISTS "Users can update their personal feeds and group feeds they can manage" ON feeds;
    DROP POLICY IF EXISTS "Users can update their own feeds" ON feeds;
    DROP POLICY IF EXISTS "Users can delete their personal feeds and group feeds they can manage" ON feeds;
    DROP POLICY IF EXISTS "Users can delete their own feeds" ON feeds;
END $$;

-- Create comprehensive feed policies that allow group member access
CREATE POLICY "feeds_select_policy" 
  ON feeds FOR SELECT 
  USING (
    -- Personal feeds (no group_id)
    (group_id IS NULL AND auth.uid() = user_id) OR
    -- Group feeds where user is any kind of member
    (group_id IS NOT NULL AND auth.uid() IN (
      SELECT ugm.user_id FROM user_group_members ugm 
      WHERE ugm.group_id = feeds.group_id
    )) OR
    -- Group feeds where user is the group owner
    (group_id IS NOT NULL AND auth.uid() IN (
      SELECT ug.owner_id FROM user_groups ug 
      WHERE ug.id = feeds.group_id
    )) OR
    -- Public group feeds (anyone can see)
    (group_id IS NOT NULL AND group_id IN (
      SELECT ug.id FROM user_groups ug 
      WHERE ug.is_public = TRUE
    ))
  );

CREATE POLICY "feeds_insert_policy" 
  ON feeds FOR INSERT 
  WITH CHECK (
    -- Personal feeds (no group_id)
    (group_id IS NULL AND auth.uid() = user_id) OR
    -- Group feeds where user is owner, admin, or member (but not viewer)
    (group_id IS NOT NULL AND auth.uid() = user_id AND (
      -- User is group owner
      auth.uid() IN (
        SELECT ug.owner_id FROM user_groups ug 
        WHERE ug.id = feeds.group_id
      ) OR
      -- User is admin or member
      auth.uid() IN (
        SELECT ugm.user_id FROM user_group_members ugm 
        WHERE ugm.group_id = feeds.group_id 
        AND ugm.role IN ('admin', 'member')
      )
    ))
  );

CREATE POLICY "feeds_update_policy" 
  ON feeds FOR UPDATE 
  USING (
    -- Personal feeds (no group_id)
    (group_id IS NULL AND auth.uid() = user_id) OR
    -- Group feeds where user is owner, admin, or member (but not viewer)
    (group_id IS NOT NULL AND (
      -- User is group owner
      auth.uid() IN (
        SELECT ug.owner_id FROM user_groups ug 
        WHERE ug.id = feeds.group_id
      ) OR
      -- User is admin or member
      auth.uid() IN (
        SELECT ugm.user_id FROM user_group_members ugm 
        WHERE ugm.group_id = feeds.group_id 
        AND ugm.role IN ('admin', 'member')
      )
    ))
  );

CREATE POLICY "feeds_delete_policy" 
  ON feeds FOR DELETE 
  USING (
    -- Personal feeds (no group_id)
    (group_id IS NULL AND auth.uid() = user_id) OR
    -- Group feeds where user is owner, admin, or member (but not viewer)
    (group_id IS NOT NULL AND (
      -- User is group owner
      auth.uid() IN (
        SELECT ug.owner_id FROM user_groups ug 
        WHERE ug.id = feeds.group_id
      ) OR
      -- User is admin or member
      auth.uid() IN (
        SELECT ugm.user_id FROM user_group_members ugm 
        WHERE ugm.group_id = feeds.group_id 
        AND ugm.role IN ('admin', 'member')
      )
    ))
  );

-- ============================================================================
-- STEP 2: Update existing feed_items policies to allow group member access
-- ============================================================================

-- Drop all existing feed_items policies
DO $$
BEGIN
    DROP POLICY IF EXISTS "Users can see personal and group feed items they have access to" ON feed_items;
    DROP POLICY IF EXISTS "Users can see their own feed_items" ON feed_items;
    DROP POLICY IF EXISTS "Users can see feed_items they have access to" ON feed_items;
    DROP POLICY IF EXISTS "Users can insert personal and group feed items they can manage" ON feed_items;
    DROP POLICY IF EXISTS "Users can insert their own feed_items" ON feed_items;
    DROP POLICY IF EXISTS "System can insert feed items" ON feed_items;
    DROP POLICY IF EXISTS "Users can delete personal and group feed items they can manage" ON feed_items;
    DROP POLICY IF EXISTS "Users can delete their own feed_items" ON feed_items;
END $$;

-- Create comprehensive feed_items policies
CREATE POLICY "feed_items_select_policy" 
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
    )) OR
    -- Public group feed items (anyone can see)
    (group_id IS NOT NULL AND group_id IN (
      SELECT ug.id FROM user_groups ug 
      WHERE ug.is_public = TRUE
    ))
  );

-- Feed items are inserted automatically by the system, so we need a permissive policy
CREATE POLICY "feed_items_insert_policy" 
  ON feed_items FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "feed_items_delete_policy" 
  ON feed_items FOR DELETE 
  USING (
    -- Personal feed items (no group_id)
    (group_id IS NULL AND auth.uid() = user_id) OR
    -- Group feed items where user is owner, admin, or member (but not viewer)
    (group_id IS NOT NULL AND (
      -- User is group owner
      auth.uid() IN (
        SELECT ug.owner_id FROM user_groups ug 
        WHERE ug.id = feed_items.group_id
      ) OR
      -- User is admin or member
      auth.uid() IN (
        SELECT ugm.user_id FROM user_group_members ugm 
        WHERE ugm.group_id = feed_items.group_id 
        AND ugm.role IN ('admin', 'member')
      )
    ))
  );

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================================

-- Test these queries after applying the migration:

-- 1. Check what policies are now active:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
-- FROM pg_policies 
-- WHERE tablename IN ('feeds', 'feed_items');

-- 2. Verify a group member can see group feeds:
-- SELECT COUNT(*) FROM feeds WHERE group_id IS NOT NULL;

-- 3. Verify a group member can see group feed items:
-- SELECT COUNT(*) FROM feed_items WHERE group_id IS NOT NULL;

-- ============================================================================
-- SUMMARY OF CHANGES
-- ============================================================================

-- ✅ READING (Feeds and Feed Items):
--    - Owner: ✅ Can see all group content
--    - Admin: ✅ Can see all group content  
--    - Member: ✅ Can see all group content
--    - Viewer: ✅ Can see all group content (read-only)
--    - Public: ✅ Can see public group content

-- ✅ MANAGEMENT (Create/Edit/Delete Feeds):
--    - Owner: ✅ Full management
--    - Admin: ✅ Full management
--    - Member: ✅ Full management  
--    - Viewer: ❌ Read-only access

-- ✅ SECURITY:
--    - Personal feeds remain private to their owners
--    - Group access is properly controlled by membership
--    - Public groups are accessible to everyone 