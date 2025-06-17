-- Migration 012: Fix User Groups RLS Recursion
-- Purpose: Simplify user_groups and user_group_members RLS policies to prevent recursion
-- Date: 2024-01-XX

BEGIN;

-- ============================================================================
-- EMERGENCY FIX: Simplify user_groups and user_group_members policies
-- ============================================================================

-- ============================================================================
-- STEP 1: Drop all problematic user_groups policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can see public groups or their own groups" ON user_groups;
DROP POLICY IF EXISTS "Users can create groups they will own" ON user_groups;
DROP POLICY IF EXISTS "Owners can update their groups" ON user_groups;
DROP POLICY IF EXISTS "Owners can delete their groups" ON user_groups;

-- ============================================================================
-- STEP 2: Drop all problematic user_group_members policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can see relevant memberships" ON user_group_members;
DROP POLICY IF EXISTS "Users can join groups via invitation" ON user_group_members;
DROP POLICY IF EXISTS "Allow membership updates" ON user_group_members;
DROP POLICY IF EXISTS "Users can leave groups" ON user_group_members;

-- ============================================================================
-- STEP 3: Create simple, non-recursive policies for user_groups
-- ============================================================================

-- Simple policy: users can see groups they own
CREATE POLICY "Owners can see their groups" 
  ON user_groups FOR SELECT 
  USING (auth.uid() = owner_id);

-- Simple policy: users can create groups they will own
CREATE POLICY "Users can create their own groups" 
  ON user_groups FOR INSERT 
  WITH CHECK (auth.uid() = owner_id);

-- Simple policy: owners can update their groups
CREATE POLICY "Owners can update their groups" 
  ON user_groups FOR UPDATE 
  USING (auth.uid() = owner_id);

-- Simple policy: owners can delete their groups
CREATE POLICY "Owners can delete their groups" 
  ON user_groups FOR DELETE 
  USING (auth.uid() = owner_id);

-- ============================================================================
-- STEP 4: Create simple, non-recursive policies for user_group_members
-- ============================================================================

-- Simple policy: users can see their own memberships
CREATE POLICY "Users can see their own memberships" 
  ON user_group_members FOR SELECT 
  USING (auth.uid() = user_id);

-- Simple policy: users can join groups (controlled by business logic)
CREATE POLICY "Users can join groups" 
  ON user_group_members FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Simple policy: allow membership updates (controlled by business logic)
CREATE POLICY "Allow membership updates" 
  ON user_group_members FOR UPDATE 
  USING (true);

-- Simple policy: users can leave groups
CREATE POLICY "Users can leave groups" 
  ON user_group_members FOR DELETE 
  USING (auth.uid() = user_id);

-- ============================================================================
-- STEP 5: Create RPC functions for user groups access
-- ============================================================================

-- Function to get all groups a user has access to (including public groups)
CREATE OR REPLACE FUNCTION get_user_accessible_groups(user_uuid UUID DEFAULT auth.uid())
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  owner_id UUID,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  is_public BOOLEAN,
  user_role TEXT,
  member_count BIGINT,
  is_owner BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If no user provided, use current authenticated user
  IF user_uuid IS NULL THEN
    user_uuid := auth.uid();
  END IF;

  -- If user is not authenticated, only return public groups
  IF user_uuid IS NULL THEN
    RETURN QUERY
    SELECT 
      ug.id,
      ug.name,
      ug.description,
      ug.owner_id,
      ug.created_at,
      ug.updated_at,
      ug.is_public,
      NULL::TEXT as user_role,
      COALESCE(member_counts.count, 0) as member_count,
      FALSE as is_owner
    FROM user_groups ug
    LEFT JOIN (
      SELECT group_id, COUNT(*) as count
      FROM user_group_members
      GROUP BY group_id
    ) member_counts ON ug.id = member_counts.group_id
    WHERE ug.is_public = TRUE;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    ug.id,
    ug.name,
    ug.description,
    ug.owner_id,
    ug.created_at,
    ug.updated_at,
    ug.is_public,
    COALESCE(ugm.role, 'none') as user_role,
    COALESCE(member_counts.count, 0) as member_count,
    (ug.owner_id = user_uuid) as is_owner
  FROM user_groups ug
  LEFT JOIN user_group_members ugm ON ug.id = ugm.group_id AND ugm.user_id = user_uuid
  LEFT JOIN (
    SELECT group_id, COUNT(*) as count
    FROM user_group_members
    GROUP BY group_id
  ) member_counts ON ug.id = member_counts.group_id
  WHERE 
    -- User owns the group
    ug.owner_id = user_uuid OR
    -- User is a member of the group
    ugm.user_id = user_uuid OR
    -- Group is public
    ug.is_public = TRUE;
END;
$$;

-- Function to get user's own groups (groups they own)
CREATE OR REPLACE FUNCTION get_user_owned_groups(user_uuid UUID DEFAULT auth.uid())
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  owner_id UUID,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  is_public BOOLEAN,
  member_count BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is authenticated
  IF user_uuid IS NULL THEN
    user_uuid := auth.uid();
  END IF;
  
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  RETURN QUERY
  SELECT 
    ug.id,
    ug.name,
    ug.description,
    ug.owner_id,
    ug.created_at,
    ug.updated_at,
    ug.is_public,
    COALESCE(member_counts.count, 0) as member_count
  FROM user_groups ug
  LEFT JOIN (
    SELECT group_id, COUNT(*) as count
    FROM user_group_members
    GROUP BY group_id
  ) member_counts ON ug.id = member_counts.group_id
  WHERE ug.owner_id = user_uuid;
END;
$$;

-- Function to get group memberships for a user
CREATE OR REPLACE FUNCTION get_user_group_memberships(user_uuid UUID DEFAULT auth.uid())
RETURNS TABLE (
  group_id UUID,
  group_name TEXT,
  group_description TEXT,
  is_public BOOLEAN,
  user_id UUID,
  role TEXT,
  joined_at TIMESTAMP WITH TIME ZONE,
  owner_id UUID,
  is_owner BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is authenticated
  IF user_uuid IS NULL THEN
    user_uuid := auth.uid();
  END IF;
  
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  RETURN QUERY
  SELECT 
    ugm.group_id,
    ug.name as group_name,
    ug.description as group_description,
    ug.is_public,
    ugm.user_id,
    ugm.role,
    ugm.joined_at,
    ug.owner_id,
    (ug.owner_id = user_uuid) as is_owner
  FROM user_group_members ugm
  JOIN user_groups ug ON ugm.group_id = ug.id
  WHERE ugm.user_id = user_uuid;
END;
$$;

-- Function to get a specific group with user's role
CREATE OR REPLACE FUNCTION get_group_with_user_role(group_uuid UUID, user_uuid UUID DEFAULT auth.uid())
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  owner_id UUID,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  is_public BOOLEAN,
  user_role TEXT,
  member_count BIGINT,
  is_owner BOOLEAN,
  can_access BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  group_is_public BOOLEAN;
  group_owner_id UUID;
  user_role_in_group TEXT;
  user_is_member BOOLEAN;
BEGIN
  -- Get group information
  SELECT ug.is_public, ug.owner_id INTO group_is_public, group_owner_id
  FROM user_groups ug WHERE ug.id = group_uuid;
  
  -- If group doesn't exist, return empty
  IF group_owner_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Check user's role in the group
  IF user_uuid IS NOT NULL THEN
    SELECT ugm.role INTO user_role_in_group
    FROM user_group_members ugm 
    WHERE ugm.group_id = group_uuid AND ugm.user_id = user_uuid;
    
    user_is_member := (user_role_in_group IS NOT NULL);
  ELSE
    user_role_in_group := NULL;
    user_is_member := FALSE;
  END IF;
  
  -- Determine if user can access this group
  DECLARE
    can_access_group BOOLEAN := FALSE;
  BEGIN
    IF group_is_public THEN
      can_access_group := TRUE;
    ELSIF user_uuid IS NOT NULL THEN
      IF group_owner_id = user_uuid THEN
        can_access_group := TRUE;
      ELSIF user_is_member THEN
        can_access_group := TRUE;
      END IF;
    END IF;
    
    -- Only return group if user can access it
    IF can_access_group THEN
      RETURN QUERY
      SELECT 
        ug.id,
        ug.name,
        ug.description,
        ug.owner_id,
        ug.created_at,
        ug.updated_at,
        ug.is_public,
        COALESCE(user_role_in_group, 'none') as user_role,
        COALESCE(member_counts.count, 0) as member_count,
        (ug.owner_id = user_uuid) as is_owner,
        can_access_group as can_access
      FROM user_groups ug
      LEFT JOIN (
        SELECT group_id, COUNT(*) as count
        FROM user_group_members
        WHERE group_id = group_uuid
        GROUP BY group_id
      ) member_counts ON ug.id = member_counts.group_id
      WHERE ug.id = group_uuid;
    END IF;
  END;
END;
$$;

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION QUERIES
-- ============================================================================

-- Test these queries after applying the migration:

-- 1. Test user accessible groups function
-- SELECT * FROM get_user_accessible_groups();

-- 2. Test user owned groups function
-- SELECT * FROM get_user_owned_groups();

-- 3. Test user group memberships function
-- SELECT * FROM get_user_group_memberships();

-- 4. Test specific group access
-- SELECT * FROM get_group_with_user_role('your-group-id');

-- 5. Test basic user_groups query (should work now without recursion)
-- SELECT id, name, is_public FROM user_groups WHERE owner_id = auth.uid();

-- ============================================================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================================================

-- Uncomment and run if you need to rollback this migration:
-- 
-- BEGIN;
-- 
-- -- Drop new functions
-- DROP FUNCTION IF EXISTS get_user_accessible_groups(UUID);
-- DROP FUNCTION IF EXISTS get_user_owned_groups(UUID);
-- DROP FUNCTION IF EXISTS get_user_group_memberships(UUID);
-- DROP FUNCTION IF EXISTS get_group_with_user_role(UUID, UUID);
-- 
-- COMMIT; 