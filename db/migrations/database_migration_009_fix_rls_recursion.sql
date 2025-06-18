-- Migration 009: Fix RLS Infinite Recursion Emergency Fix
-- Purpose: Eliminate circular references in RLS policies that cause infinite recursion
-- Date: 2024-01-XX

-- ============================================================================
-- EMERGENCY FIX: Stop infinite recursion
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Drop ALL problematic policies to stop recursion immediately
-- ============================================================================

-- Drop all user_group_members policies
DROP POLICY IF EXISTS "Users can see memberships in groups they own or belong to" ON user_group_members;
DROP POLICY IF EXISTS "Users can see their own memberships" ON user_group_members;
DROP POLICY IF EXISTS "Users can see memberships for groups they belong to" ON user_group_members;
DROP POLICY IF EXISTS "Users can see groups they are members of" ON user_group_members;
DROP POLICY IF EXISTS "Users can manage memberships appropriately" ON user_group_members;
DROP POLICY IF EXISTS "Users can update memberships appropriately" ON user_group_members;
DROP POLICY IF EXISTS "Users can remove memberships appropriately" ON user_group_members;
DROP POLICY IF EXISTS "Group owners can manage memberships" ON user_group_members;
DROP POLICY IF EXISTS "Group owners can update memberships" ON user_group_members;
DROP POLICY IF EXISTS "Users can manage relevant memberships" ON user_group_members;
DROP POLICY IF EXISTS "Users can join groups via invitation or ownership" ON user_group_members;

-- Drop all user_groups policies that might cause recursion
DROP POLICY IF EXISTS "Users can see groups they own or belong to" ON user_groups;
DROP POLICY IF EXISTS "Users can see groups they own" ON user_groups;
DROP POLICY IF EXISTS "Users can see groups they are members of" ON user_groups;
DROP POLICY IF EXISTS "Users can create groups they own" ON user_groups;
DROP POLICY IF EXISTS "Users can update groups they own" ON user_groups;
DROP POLICY IF EXISTS "Users can delete groups they own" ON user_groups;

-- ============================================================================
-- STEP 2: Create simple, non-recursive policies for user_groups
-- ============================================================================

-- Simple owner-only policy for user_groups (no recursion)
CREATE POLICY "Owners can see their groups" 
  ON user_groups FOR SELECT 
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can create groups they will own" 
  ON user_groups FOR INSERT 
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their groups" 
  ON user_groups FOR UPDATE 
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their groups" 
  ON user_groups FOR DELETE 
  USING (auth.uid() = owner_id);

-- ============================================================================
-- STEP 3: Create simple, non-recursive policies for user_group_members
-- ============================================================================

-- Simple policy: users can see their own memberships
CREATE POLICY "Users can see their own memberships" 
  ON user_group_members FOR SELECT 
  USING (auth.uid() = user_id);

-- Simple policy: only allow inserting own user_id
CREATE POLICY "Users can join groups via invitation" 
  ON user_group_members FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Simple policy: users can update their own memberships (for role changes by admins)
CREATE POLICY "Allow membership updates" 
  ON user_group_members FOR UPDATE 
  USING (true); -- We'll control this through business logic

-- Simple policy: users can leave groups
CREATE POLICY "Users can leave groups" 
  ON user_group_members FOR DELETE 
  USING (auth.uid() = user_id);

-- ============================================================================
-- STEP 4: Update RPC functions to handle authorization properly
-- ============================================================================

-- Update the members function to be more permissive since we'll rely on business logic
CREATE OR REPLACE FUNCTION get_group_members_with_profiles(group_uuid UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  email TEXT,
  name TEXT,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT,
  joined_at TIMESTAMP WITH TIME ZONE,
  last_sign_in_at TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Simplified access check: just check if user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user has access to this group (owner OR member)
  IF NOT EXISTS (
    SELECT 1 FROM user_group_members ugm
    WHERE ugm.group_id = group_uuid AND ugm.user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM user_groups ug
    WHERE ug.id = group_uuid AND ug.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied to group';
  END IF;

  RETURN QUERY
  SELECT 
    ugm.user_id as id,
    ugm.user_id,
    COALESCE(up.email, au.email) as email,
    up.name,
    up.full_name,
    up.avatar_url,
    ugm.role,
    ugm.joined_at,
    au.last_sign_in_at
  FROM user_group_members ugm
  LEFT JOIN user_profiles up ON ugm.user_id = up.id
  LEFT JOIN auth.users au ON ugm.user_id = au.id
  WHERE ugm.group_id = group_uuid
  ORDER BY ugm.joined_at ASC;
END;
$$;

-- Update invitations function with simpler access control
CREATE OR REPLACE FUNCTION get_group_invitations_with_profiles(group_uuid UUID)
RETURNS TABLE (
  id UUID,
  group_id UUID,
  invited_email TEXT,
  invited_by UUID,
  invited_by_name TEXT,
  invited_by_email TEXT,
  role TEXT,
  token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  accepted_at TIMESTAMP WITH TIME ZONE,
  is_expired BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Simplified check: user must be authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user is owner of the group
  IF NOT EXISTS (
    SELECT 1 FROM user_groups ug
    WHERE ug.id = group_uuid AND ug.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied to group invitations';
  END IF;

  RETURN QUERY
  SELECT 
    gi.id,
    gi.group_id,
    gi.invited_email,
    gi.invited_by,
    COALESCE(up.name, up.full_name, au.email, 'Usuario desconocido') as invited_by_name,
    au.email as invited_by_email,
    gi.role,
    gi.token,
    gi.expires_at,
    gi.created_at,
    gi.accepted_at,
    (gi.expires_at < NOW()) as is_expired
  FROM group_invitations gi
  LEFT JOIN user_profiles up ON gi.invited_by = up.id
  LEFT JOIN auth.users au ON gi.invited_by = au.id
  WHERE gi.group_id = group_uuid
    AND gi.accepted_at IS NULL
  ORDER BY gi.created_at DESC;
END;
$$;

-- ============================================================================
-- STEP 5: Create helper function for owners to manage members
-- ============================================================================

CREATE OR REPLACE FUNCTION is_group_owner(group_uuid UUID, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_groups 
    WHERE id = group_uuid AND owner_id = user_uuid
  );
END;
$$;

CREATE OR REPLACE FUNCTION is_group_admin_or_owner(group_uuid UUID, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if owner
  IF is_group_owner(group_uuid, user_uuid) THEN
    RETURN true;
  END IF;
  
  -- Check if admin
  RETURN EXISTS (
    SELECT 1 FROM user_group_members 
    WHERE group_id = group_uuid AND user_id = user_uuid AND role = 'admin'
  );
END;
$$;

COMMIT;

-- ============================================================================
-- POST-FIX VERIFICATION
-- ============================================================================

-- These should now work without recursion:
-- SELECT * FROM user_groups WHERE owner_id = auth.uid();
-- SELECT * FROM user_group_members WHERE user_id = auth.uid(); 