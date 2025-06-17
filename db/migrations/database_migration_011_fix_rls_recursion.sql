-- Migration 011: Fix RLS Infinite Recursion for Public Groups
-- Purpose: Simplify RLS policies to prevent infinite recursion
-- Date: 2024-01-XX

BEGIN;

-- ============================================================================
-- EMERGENCY FIX: Simplify RLS policies to prevent recursion
-- ============================================================================

-- ============================================================================
-- STEP 1: Drop problematic complex policies
-- ============================================================================

-- Drop the complex feeds policy that causes recursion
DROP POLICY IF EXISTS "Users can see feeds they have access to" ON feeds;

-- Drop the complex feed_items policy that causes recursion
DROP POLICY IF EXISTS "Users can see feed_items they have access to" ON feed_items;

-- ============================================================================
-- STEP 2: Create simple, non-recursive policies for feeds
-- ============================================================================

-- Simple policy: users can see their own feeds
CREATE POLICY "Users can see their own feeds" 
  ON feeds FOR SELECT 
  USING (auth.uid() = user_id);

-- Simple policy: users can insert their own feeds
CREATE POLICY "Users can insert their own feeds" 
  ON feeds FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Simple policy: users can update their own feeds
CREATE POLICY "Users can update their own feeds" 
  ON feeds FOR UPDATE 
  USING (auth.uid() = user_id);

-- Simple policy: users can delete their own feeds
CREATE POLICY "Users can delete their own feeds" 
  ON feeds FOR DELETE 
  USING (auth.uid() = user_id);

-- ============================================================================
-- STEP 3: Create simple, non-recursive policies for feed_items
-- ============================================================================

-- Simple policy: users can see their own feed_items
CREATE POLICY "Users can see their own feed_items" 
  ON feed_items FOR SELECT 
  USING (auth.uid() = user_id);

-- Simple policy: users can insert their own feed_items
CREATE POLICY "Users can insert their own feed_items" 
  ON feed_items FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Simple policy: users can delete their own feed_items
CREATE POLICY "Users can delete their own feed_items" 
  ON feed_items FOR DELETE 
  USING (auth.uid() = user_id);

-- ============================================================================
-- STEP 4: Create enhanced RPC functions for public group access
-- ============================================================================

-- Function to get all feeds a user has access to (including public groups)
CREATE OR REPLACE FUNCTION get_user_accessible_feeds(user_uuid UUID DEFAULT auth.uid())
RETURNS TABLE (
  id UUID,
  url TEXT,
  title TEXT,
  description TEXT,
  integration_name TEXT,
  integration_alias TEXT,
  last_fetched TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  user_id UUID,
  group_id UUID,
  is_public_group BOOLEAN,
  user_role TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If no user provided, use current authenticated user
  IF user_uuid IS NULL THEN
    user_uuid := auth.uid();
  END IF;

  -- If user is not authenticated, only return public group feeds
  IF user_uuid IS NULL THEN
    RETURN QUERY
    SELECT 
      f.id,
      f.url,
      f.title,
      f.description,
      f.integration_name,
      f.integration_alias,
      f.last_fetched,
      f.created_at,
      f.updated_at,
      f.user_id,
      f.group_id,
      TRUE as is_public_group,
      NULL::TEXT as user_role
    FROM feeds f
    JOIN user_groups ug ON f.group_id = ug.id
    WHERE ug.is_public = TRUE;
    RETURN;
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
    f.created_at,
    f.updated_at,
    f.user_id,
    f.group_id,
    ug.is_public as is_public_group,
    COALESCE(ugm.role, 'none') as user_role
  FROM feeds f
  LEFT JOIN user_groups ug ON f.group_id = ug.id
  LEFT JOIN user_group_members ugm ON ug.id = ugm.group_id AND ugm.user_id = user_uuid
  WHERE 
    -- User's own feeds
    f.user_id = user_uuid OR
    -- Feeds from public groups
    (ug.is_public = TRUE) OR
    -- Feeds from groups user belongs to
    (ugm.user_id = user_uuid) OR
    -- Feeds from groups user owns
    (ug.owner_id = user_uuid);
END;
$$;

-- Function to get all feed items a user has access to
CREATE OR REPLACE FUNCTION get_user_accessible_feed_items(
  user_uuid UUID DEFAULT auth.uid(),
  item_limit INTEGER DEFAULT 100,
  offset_count INTEGER DEFAULT 0
)
RETURNS TABLE (
  id TEXT,
  feed_id UUID,
  title TEXT,
  link TEXT,
  content TEXT,
  content_snippet TEXT,
  pub_date TIMESTAMP WITH TIME ZONE,
  integration_name TEXT,
  integration_alias TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  user_id UUID,
  feed_title TEXT,
  is_public_group BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If no user provided, use current authenticated user
  IF user_uuid IS NULL THEN
    user_uuid := auth.uid();
  END IF;

  -- If user is not authenticated, only return public group feed items
  IF user_uuid IS NULL THEN
    RETURN QUERY
    SELECT 
      fi.id,
      fi.feed_id,
      fi.title,
      fi.link,
      fi.content,
      fi.content_snippet,
      fi.pub_date,
      fi.integration_name,
      fi.integration_alias,
      fi.created_at,
      fi.user_id,
      f.title as feed_title,
      TRUE as is_public_group
    FROM feed_items fi
    JOIN feeds f ON fi.feed_id = f.id
    JOIN user_groups ug ON f.group_id = ug.id
    WHERE ug.is_public = TRUE
    ORDER BY fi.pub_date DESC
    LIMIT item_limit OFFSET offset_count;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    fi.id,
    fi.feed_id,
    fi.title,
    fi.link,
    fi.content,
    fi.content_snippet,
    fi.pub_date,
    fi.integration_name,
    fi.integration_alias,
    fi.created_at,
    fi.user_id,
    f.title as feed_title,
    COALESCE(ug.is_public, FALSE) as is_public_group
  FROM feed_items fi
  JOIN feeds f ON fi.feed_id = f.id
  LEFT JOIN user_groups ug ON f.group_id = ug.id
  LEFT JOIN user_group_members ugm ON ug.id = ugm.group_id AND ugm.user_id = user_uuid
  WHERE 
    -- User's own feed items
    fi.user_id = user_uuid OR
    -- Feed items from public groups
    (ug.is_public = TRUE) OR
    -- Feed items from groups user belongs to
    (ugm.user_id = user_uuid) OR
    -- Feed items from groups user owns
    (ug.owner_id = user_uuid)
  ORDER BY fi.pub_date DESC
  LIMIT item_limit OFFSET offset_count;
END;
$$;

-- Function to check if user can access a specific feed
CREATE OR REPLACE FUNCTION can_user_access_feed(feed_uuid UUID, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  feed_user_id UUID;
  feed_group_id UUID;
  group_is_public BOOLEAN;
  user_is_member BOOLEAN;
  user_is_owner BOOLEAN;
BEGIN
  -- Get feed information
  SELECT f.user_id, f.group_id INTO feed_user_id, feed_group_id
  FROM feeds f WHERE f.id = feed_uuid;
  
  -- If feed doesn't exist, return false
  IF feed_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- If no user provided, only allow access to public group feeds
  IF user_uuid IS NULL THEN
    IF feed_group_id IS NULL THEN
      RETURN FALSE;
    END IF;
    
    SELECT is_public INTO group_is_public
    FROM user_groups WHERE id = feed_group_id;
    
    RETURN COALESCE(group_is_public, FALSE);
  END IF;
  
  -- User can access their own feeds
  IF feed_user_id = user_uuid THEN
    RETURN TRUE;
  END IF;
  
  -- If feed belongs to a group, check group access
  IF feed_group_id IS NOT NULL THEN
    -- Check if group is public
    SELECT is_public INTO group_is_public
    FROM user_groups WHERE id = feed_group_id;
    
    IF group_is_public THEN
      RETURN TRUE;
    END IF;
    
    -- Check if user is member of the group
    SELECT EXISTS(
      SELECT 1 FROM user_group_members 
      WHERE group_id = feed_group_id AND user_id = user_uuid
    ) INTO user_is_member;
    
    IF user_is_member THEN
      RETURN TRUE;
    END IF;
    
    -- Check if user is owner of the group
    SELECT EXISTS(
      SELECT 1 FROM user_groups 
      WHERE id = feed_group_id AND owner_id = user_uuid
    ) INTO user_is_owner;
    
    IF user_is_owner THEN
      RETURN TRUE;
    END IF;
  END IF;
  
  RETURN FALSE;
END;
$$;

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION QUERIES
-- ============================================================================

-- Test these queries after applying the migration:

-- 1. Test user accessible feeds function
-- SELECT * FROM get_user_accessible_feeds();

-- 2. Test user accessible feed items function
-- SELECT * FROM get_user_accessible_feed_items();

-- 3. Test feed access check
-- SELECT can_user_access_feed('your-feed-id');

-- 4. Test basic feeds query (should work now without recursion)
-- SELECT id, title FROM feeds LIMIT 5;

-- ============================================================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================================================

-- Uncomment and run if you need to rollback this migration:
-- 
-- BEGIN;
-- 
-- -- Drop new functions
-- DROP FUNCTION IF EXISTS get_user_accessible_feeds(UUID);
-- DROP FUNCTION IF EXISTS get_user_accessible_feed_items(UUID, INTEGER, INTEGER);
-- DROP FUNCTION IF EXISTS can_user_access_feed(UUID, UUID);
-- 
-- -- Restore original complex policies (if needed)
-- -- Note: This would restore the recursion problem
-- 
-- COMMIT; 