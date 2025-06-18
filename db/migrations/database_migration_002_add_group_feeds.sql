-- Migration 002: Add Group Support to Feeds
-- Purpose: Enable feeds to belong to groups or be personal
-- Run this script in your Supabase SQL Editor AFTER running migration 001 and the RLS fix

-- ============================================================================
-- ADD GROUP SUPPORT TO FEEDS
-- ============================================================================

BEGIN;

-- Add group_id column to feeds table (nullable - NULL means personal feed)
ALTER TABLE feeds 
ADD COLUMN group_id UUID REFERENCES user_groups(id) ON DELETE CASCADE;

-- Add group_id column to feed_items table for consistency
ALTER TABLE feed_items 
ADD COLUMN group_id UUID REFERENCES user_groups(id) ON DELETE CASCADE;

-- Add indexes for group-based queries
CREATE INDEX idx_feeds_group_id ON feeds(group_id);
CREATE INDEX idx_feeds_group_user ON feeds(group_id, user_id);
CREATE INDEX idx_feed_items_group_id ON feed_items(group_id);
CREATE INDEX idx_feed_items_group_user ON feed_items(group_id, user_id);

-- ============================================================================
-- UPDATE RLS POLICIES FOR GROUP FEEDS
-- ============================================================================

-- Drop existing feed policies
DROP POLICY IF EXISTS "Users can only see their own feeds" ON feeds;
DROP POLICY IF EXISTS "Users can only insert their own feeds" ON feeds;
DROP POLICY IF EXISTS "Users can only update their own feeds" ON feeds;
DROP POLICY IF EXISTS "Users can only delete their own feeds" ON feeds;

-- Create new policies that handle both personal and group feeds
CREATE POLICY "Users can see their personal feeds and group feeds they belong to" 
  ON feeds FOR SELECT 
  USING (
    -- Personal feeds (no group_id)
    (group_id IS NULL AND auth.uid() = user_id) OR
    -- Group feeds where user is a member
    (group_id IS NOT NULL AND auth.uid() IN (
      SELECT user_id FROM user_group_members WHERE group_id = feeds.group_id
    ))
  );

CREATE POLICY "Users can insert personal feeds and group feeds they can manage" 
  ON feeds FOR INSERT 
  WITH CHECK (
    -- Personal feeds (no group_id)
    (group_id IS NULL AND auth.uid() = user_id) OR
    -- Group feeds where user is owner or admin
    (group_id IS NOT NULL AND auth.uid() = user_id AND auth.uid() IN (
      SELECT ugm.user_id FROM user_group_members ugm 
      WHERE ugm.group_id = feeds.group_id 
      AND ugm.role IN ('owner', 'admin')
    ))
  );

CREATE POLICY "Users can update their personal feeds and group feeds they can manage" 
  ON feeds FOR UPDATE 
  USING (
    -- Personal feeds (no group_id)
    (group_id IS NULL AND auth.uid() = user_id) OR
    -- Group feeds where user is owner or admin
    (group_id IS NOT NULL AND auth.uid() IN (
      SELECT ugm.user_id FROM user_group_members ugm 
      WHERE ugm.group_id = feeds.group_id 
      AND ugm.role IN ('owner', 'admin')
    ))
  );

CREATE POLICY "Users can delete their personal feeds and group feeds they can manage" 
  ON feeds FOR DELETE 
  USING (
    -- Personal feeds (no group_id)
    (group_id IS NULL AND auth.uid() = user_id) OR
    -- Group feeds where user is owner or admin
    (group_id IS NOT NULL AND auth.uid() IN (
      SELECT ugm.user_id FROM user_group_members ugm 
      WHERE ugm.group_id = feeds.group_id 
      AND ugm.role IN ('owner', 'admin')
    ))
  );

-- ============================================================================
-- UPDATE FEED ITEMS POLICIES FOR GROUP SUPPORT
-- ============================================================================

-- Drop existing feed_items policies
DROP POLICY IF EXISTS "Users can only see their own feed_items" ON feed_items;
DROP POLICY IF EXISTS "Users can only insert their own feed_items" ON feed_items;
DROP POLICY IF EXISTS "Users can only delete their own feed_items" ON feed_items;

-- Create new policies for feed_items that handle groups
CREATE POLICY "Users can see personal and group feed items they have access to" 
  ON feed_items FOR SELECT 
  USING (
    -- Personal feed items (no group_id)
    (group_id IS NULL AND auth.uid() = user_id) OR
    -- Group feed items where user is a member
    (group_id IS NOT NULL AND auth.uid() IN (
      SELECT user_id FROM user_group_members WHERE group_id = feed_items.group_id
    ))
  );

CREATE POLICY "Users can insert personal and group feed items they can manage" 
  ON feed_items FOR INSERT 
  WITH CHECK (
    -- Personal feed items (no group_id)
    (group_id IS NULL AND auth.uid() = user_id) OR
    -- Group feed items where user is owner or admin
    (group_id IS NOT NULL AND auth.uid() = user_id AND auth.uid() IN (
      SELECT ugm.user_id FROM user_group_members ugm 
      WHERE ugm.group_id = feed_items.group_id 
      AND ugm.role IN ('owner', 'admin')
    ))
  );

CREATE POLICY "Users can delete personal and group feed items they can manage" 
  ON feed_items FOR DELETE 
  USING (
    -- Personal feed items (no group_id)
    (group_id IS NULL AND auth.uid() = user_id) OR
    -- Group feed items where user is owner or admin
    (group_id IS NOT NULL AND auth.uid() IN (
      SELECT ugm.user_id FROM user_group_members ugm 
      WHERE ugm.group_id = feed_items.group_id 
      AND ugm.role IN ('owner', 'admin')
    ))
  );

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- After running this migration, test with these queries:

-- 1. Test personal feed creation (should work)
-- INSERT INTO feeds (url, title, integration_name, user_id) 
-- VALUES ('https://example.com/feed.rss', 'Test Feed', 'Test Integration', auth.uid());

-- 2. Test group feed creation (should work for group members)
-- INSERT INTO feeds (url, title, integration_name, user_id, group_id) 
-- VALUES ('https://example.com/group-feed.rss', 'Group Feed', 'Group Integration', auth.uid(), 'group-id-here');

-- 3. Test feed selection (should show both personal and group feeds)
-- SELECT * FROM feeds WHERE 
--   (group_id IS NULL AND user_id = auth.uid()) OR 
--   (group_id IS NOT NULL AND group_id IN (
--     SELECT group_id FROM user_group_members WHERE user_id = auth.uid()
--   ));

-- ============================================================================
-- NOTES
-- ============================================================================

-- 1. Existing feeds will have group_id = NULL (personal feeds)
-- 2. New group feeds will have group_id set to the group they belong to
-- 3. Users can see:
--    - Their own personal feeds (group_id IS NULL)
--    - Group feeds for groups they're members of
-- 4. Users can manage (add/edit/delete):
--    - Their own personal feeds
--    - Group feeds for groups where they're owner or admin 