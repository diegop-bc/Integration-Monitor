-- Migration 010: Add Public/Private Groups Support
-- Purpose: Implement public and private group functionality
-- Date: 2024-01-XX

BEGIN;

-- ============================================================================
-- STEP 1.1: Add is_public column to user_groups table
-- ============================================================================

-- Add is_public column with default false (private)
ALTER TABLE user_groups 
ADD COLUMN is_public BOOLEAN DEFAULT FALSE NOT NULL;

-- Set all existing groups to private by default
UPDATE user_groups SET is_public = FALSE WHERE is_public IS NULL;

-- Add index for better performance on public group queries
CREATE INDEX idx_user_groups_is_public ON user_groups(is_public) WHERE is_public = TRUE;

-- ============================================================================
-- STEP 1.2: Update RLS Policies for Public Groups
-- ============================================================================

-- Drop existing restrictive policies that we need to update
DROP POLICY IF EXISTS "Owners can see their groups" ON user_groups;

-- Create new policy for groups that allows public read access
CREATE POLICY "Users can see public groups or their own groups" 
  ON user_groups FOR SELECT 
  USING (
    is_public = TRUE OR 
    auth.uid() = owner_id
  );

-- Keep existing policies for other operations (INSERT, UPDATE, DELETE remain owner-only)
-- These were already created in previous migrations

-- Update user_group_members policies to hide member info in public groups
DROP POLICY IF EXISTS "Users can see their own memberships" ON user_group_members;

-- New policy: users can see their own memberships + limited public group info
CREATE POLICY "Users can see relevant memberships" 
  ON user_group_members FOR SELECT 
  USING (
    -- Users can always see their own memberships
    auth.uid() = user_id OR
    -- Owners can see all members of their groups
    auth.uid() IN (
      SELECT owner_id FROM user_groups 
      WHERE id = user_group_members.group_id
    )
    -- Note: Public group member visibility will be controlled via functions, not RLS
  );

-- Update feeds policies to allow read access for public groups
ALTER TABLE feeds ENABLE ROW LEVEL SECURITY;

-- Drop existing restrictive feed policies
DROP POLICY IF EXISTS "Users can only see their own feeds" ON feeds;

-- Create new policy for feeds that considers group visibility
CREATE POLICY "Users can see feeds they have access to" 
  ON feeds FOR SELECT 
  USING (
    -- Users can see their own feeds
    auth.uid() = user_id OR
    -- Users can see feeds in public groups
    group_id IN (
      SELECT id FROM user_groups 
      WHERE is_public = TRUE
    ) OR
    -- Users can see feeds in groups they belong to
    group_id IN (
      SELECT group_id FROM user_group_members 
      WHERE user_id = auth.uid()
    )
  );

-- Update feed_items policies to allow read access for public groups
ALTER TABLE feed_items ENABLE ROW LEVEL SECURITY;

-- Drop existing restrictive feed_items policies
DROP POLICY IF EXISTS "Users can only see their own feed_items" ON feed_items;

-- Create new policy for feed_items that considers group visibility
CREATE POLICY "Users can see feed_items they have access to" 
  ON feed_items FOR SELECT 
  USING (
    -- Users can see their own feed_items
    auth.uid() = user_id OR
    -- Users can see feed_items from feeds in public groups
    feed_id IN (
      SELECT f.id FROM feeds f
      JOIN user_groups ug ON f.group_id = ug.id
      WHERE ug.is_public = TRUE
    ) OR
    -- Users can see feed_items from feeds in groups they belong to
    feed_id IN (
      SELECT f.id FROM feeds f
      JOIN user_group_members ugm ON f.group_id = ugm.group_id
      WHERE ugm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- STEP 1.3: Create Database Functions for Public Groups
-- ============================================================================

-- Function to check if a group is public
CREATE OR REPLACE FUNCTION is_group_public(group_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_groups 
    WHERE id = group_uuid AND is_public = TRUE
  );
END;
$$;

-- Function to get public group statistics (without member details)
CREATE OR REPLACE FUNCTION get_public_group_stats(group_uuid UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  member_count BIGINT,
  feed_count BIGINT,
  total_feed_items BIGINT,
  last_activity TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if group is public
  IF NOT is_group_public(group_uuid) THEN
    RAISE EXCEPTION 'Group is not public or does not exist';
  END IF;

  RETURN QUERY
  SELECT 
    ug.id,
    ug.name,
    ug.description,
    COALESCE(member_stats.member_count, 0) as member_count,
    COALESCE(feed_stats.feed_count, 0) as feed_count,
    COALESCE(feed_stats.total_items, 0) as total_feed_items,
    COALESCE(feed_stats.last_activity, ug.created_at) as last_activity,
    ug.created_at
  FROM user_groups ug
  LEFT JOIN (
    SELECT 
      group_id,
      COUNT(*) as member_count
    FROM user_group_members 
    WHERE group_id = group_uuid
    GROUP BY group_id
  ) member_stats ON ug.id = member_stats.group_id
  LEFT JOIN (
    SELECT 
      f.group_id,
      COUNT(DISTINCT f.id) as feed_count,
      COUNT(fi.id) as total_items,
      MAX(fi.pub_date) as last_activity
    FROM feeds f
    LEFT JOIN feed_items fi ON f.id = fi.feed_id
    WHERE f.group_id = group_uuid
    GROUP BY f.group_id
  ) feed_stats ON ug.id = feed_stats.group_id
  WHERE ug.id = group_uuid;
END;
$$;

-- Function to get public group feeds (read-only view)
CREATE OR REPLACE FUNCTION get_public_group_feeds(group_uuid UUID)
RETURNS TABLE (
  id UUID,
  url TEXT,
  title TEXT,
  description TEXT,
  integration_name TEXT,
  integration_alias TEXT,
  last_fetched TIMESTAMP WITH TIME ZONE,
  recent_items_count BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if group is public
  IF NOT is_group_public(group_uuid) THEN
    RAISE EXCEPTION 'Group is not public or does not exist';
  END IF;

  RETURN QUERY
  SELECT 
    f.id,
    f.url,
    f.title,
    f.description,
    f.integration_name,
    f.integration_alias,
    f.last_fetched,
    COALESCE(recent_items.count, 0) as recent_items_count
  FROM feeds f
  LEFT JOIN (
    SELECT 
      feed_id,
      COUNT(*) as count
    FROM feed_items 
    WHERE pub_date > NOW() - INTERVAL '7 days'
    GROUP BY feed_id
  ) recent_items ON f.id = recent_items.feed_id
  WHERE f.group_id = group_uuid
  ORDER BY f.created_at ASC;
END;
$$;

-- Function to get recent feed items for public groups
CREATE OR REPLACE FUNCTION get_public_group_recent_items(group_uuid UUID, item_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id TEXT,
  feed_id UUID,
  feed_title TEXT,
  integration_name TEXT,
  title TEXT,
  link TEXT,
  content_snippet TEXT,
  pub_date TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if group is public
  IF NOT is_group_public(group_uuid) THEN
    RAISE EXCEPTION 'Group is not public or does not exist';
  END IF;

  RETURN QUERY
  SELECT 
    fi.id,
    fi.feed_id,
    f.title as feed_title,
    fi.integration_name,
    fi.title,
    fi.link,
    fi.content_snippet,
    fi.pub_date
  FROM feed_items fi
  JOIN feeds f ON fi.feed_id = f.id
  WHERE f.group_id = group_uuid
  ORDER BY fi.pub_date DESC
  LIMIT item_limit;
END;
$$;

-- Function for authenticated users to join public groups
CREATE OR REPLACE FUNCTION join_public_group(group_uuid UUID)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  role TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id UUID;
BEGIN
  -- Check if user is authenticated
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'User not authenticated', NULL::TEXT;
    RETURN;
  END IF;

  -- Check if group is public
  IF NOT is_group_public(group_uuid) THEN
    RETURN QUERY SELECT FALSE, 'Group is not public or does not exist', NULL::TEXT;
    RETURN;
  END IF;

  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM user_group_members 
    WHERE group_id = group_uuid AND user_id = current_user_id
  ) THEN
    RETURN QUERY SELECT FALSE, 'User is already a member of this group', NULL::TEXT;
    RETURN;
  END IF;

  -- Add user as viewer (read-only member)
  INSERT INTO user_group_members (group_id, user_id, role)
  VALUES (group_uuid, current_user_id, 'viewer');

  RETURN QUERY SELECT TRUE, 'Successfully joined group as viewer', 'viewer'::TEXT;
END;
$$;

-- Function to toggle group visibility (admin/owner only)
CREATE OR REPLACE FUNCTION toggle_group_visibility(group_uuid UUID, make_public BOOLEAN)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  is_public BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id UUID;
BEGIN
  -- Check if user is authenticated
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'User not authenticated', NULL::BOOLEAN;
    RETURN;
  END IF;

  -- Check if user is owner or admin of the group
  IF NOT (
    is_group_owner(group_uuid, current_user_id) OR
    is_group_admin_or_owner(group_uuid, current_user_id)
  ) THEN
    RETURN QUERY SELECT FALSE, 'Access denied: not an admin or owner', NULL::BOOLEAN;
    RETURN;
  END IF;

  -- Update group visibility
  UPDATE user_groups 
  SET is_public = make_public 
  WHERE id = group_uuid;

  -- Check if update was successful
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Group not found', NULL::BOOLEAN;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, 
    CASE 
      WHEN make_public THEN 'Group is now public'
      ELSE 'Group is now private'
    END,
    make_public;
END;
$$;

-- Add viewer role to the existing role check constraint
ALTER TABLE user_group_members 
DROP CONSTRAINT IF EXISTS user_group_members_role_check;

ALTER TABLE user_group_members 
ADD CONSTRAINT user_group_members_role_check 
CHECK (role IN ('owner', 'admin', 'member', 'viewer'));

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION QUERIES
-- ============================================================================

-- Test these queries after applying the migration:

-- 1. Check that is_public column was added successfully
-- SELECT id, name, is_public FROM user_groups LIMIT 5;

-- 2. Test public group stats function (replace with actual group ID)
-- SELECT * FROM get_public_group_stats('your-public-group-id');

-- 3. Test group visibility toggle (replace with actual group ID)
-- SELECT * FROM toggle_group_visibility('your-group-id', true);

-- 4. Verify that viewer role is accepted
-- INSERT INTO user_group_members (group_id, user_id, role) 
-- VALUES ('test-group-id', 'test-user-id', 'viewer');

-- ============================================================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================================================

-- Uncomment and run if you need to rollback this migration:
-- 
-- BEGIN;
-- 
-- -- Drop new functions
-- DROP FUNCTION IF EXISTS is_group_public(UUID);
-- DROP FUNCTION IF EXISTS get_public_group_stats(UUID);
-- DROP FUNCTION IF EXISTS get_public_group_feeds(UUID);
-- DROP FUNCTION IF EXISTS get_public_group_recent_items(UUID, INTEGER);
-- DROP FUNCTION IF EXISTS join_public_group(UUID);
-- DROP FUNCTION IF EXISTS toggle_group_visibility(UUID, BOOLEAN);
-- 
-- -- Remove viewer role from constraint
-- ALTER TABLE user_group_members 
-- DROP CONSTRAINT IF EXISTS user_group_members_role_check;
-- ALTER TABLE user_group_members 
-- ADD CONSTRAINT user_group_members_role_check 
-- CHECK (role IN ('owner', 'admin', 'member'));
-- 
-- -- Drop new policies and restore old ones
-- -- [Add specific policy restoration here if needed]
-- 
-- -- Remove is_public column
-- DROP INDEX IF EXISTS idx_user_groups_is_public;
-- ALTER TABLE user_groups DROP COLUMN IF EXISTS is_public;
-- 
-- COMMIT; 