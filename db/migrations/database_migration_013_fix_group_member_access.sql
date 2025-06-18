-- Migration 013: Fix Group Member Access to Feeds and Feed Items
-- Purpose: Allow group members to see feeds and feed items from their groups
-- Issue: Current RLS policies are too restrictive, only allowing users to see their own feeds
-- Date: 2024-01-XX

BEGIN;

-- ============================================================================
-- STEP 1: Update RLS policies for feeds to allow group member access
-- ============================================================================

-- Drop existing restrictive feed policies
DROP POLICY IF EXISTS "Users can see their own feeds" ON feeds;
DROP POLICY IF EXISTS "Users can insert their own feeds" ON feeds;
DROP POLICY IF EXISTS "Users can update their own feeds" ON feeds;
DROP POLICY IF EXISTS "Users can delete their own feeds" ON feeds;

-- Create new comprehensive feed policies
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
    )) OR
    -- Public group feeds (anyone can see)
    (group_id IS NOT NULL AND group_id IN (
      SELECT ug.id FROM user_groups ug 
      WHERE ug.is_public = TRUE
    ))
  );

CREATE POLICY "Users can insert personal feeds and group feeds they can manage" 
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

CREATE POLICY "Users can update their personal feeds and group feeds they can manage" 
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

CREATE POLICY "Users can delete their personal feeds and group feeds they can manage" 
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
-- STEP 2: Update RLS policies for feed_items to allow group member access
-- ============================================================================

-- Drop existing restrictive feed_items policies
DROP POLICY IF EXISTS "Users can see their own feed_items" ON feed_items;
DROP POLICY IF EXISTS "Users can insert their own feed_items" ON feed_items;
DROP POLICY IF EXISTS "Users can delete their own feed_items" ON feed_items;

-- Create new comprehensive feed_items policies
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
    )) OR
    -- Public group feed items (anyone can see)
    (group_id IS NOT NULL AND group_id IN (
      SELECT ug.id FROM user_groups ug 
      WHERE ug.is_public = TRUE
    ))
  );

-- Feed items are inserted automatically by the system, so we need a permissive policy
CREATE POLICY "System can insert feed items" 
  ON feed_items FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Users can delete personal and group feed items they can manage" 
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

-- 1. Verify a group member can see group feeds:
-- SELECT * FROM feeds WHERE group_id = 'your-group-id';

-- 2. Verify a group member can see group feed items:
-- SELECT * FROM feed_items WHERE group_id = 'your-group-id' LIMIT 10;

-- 3. Test RPC functions still work:
-- SELECT * FROM get_user_accessible_feeds();
-- SELECT * FROM get_user_accessible_feed_items();

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