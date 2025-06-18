-- Migration 001b: Fix RLS Policies for User Groups
-- Purpose: Resolve infinite recursion in user_groups RLS policies
-- Run this script in your Supabase SQL Editor AFTER running the main migration

-- ============================================================================
-- FIX RLS POLICIES TO PREVENT INFINITE RECURSION
-- ============================================================================

BEGIN;

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can see groups they own or belong to" ON user_groups;
DROP POLICY IF EXISTS "Users can see memberships for groups they belong to" ON user_group_members;

-- ============================================================================
-- FIXED USER GROUPS POLICIES (without circular references)
-- ============================================================================

-- Simple policy: Users can see groups they own
CREATE POLICY "Users can see groups they own" 
  ON user_groups FOR SELECT 
  USING (auth.uid() = owner_id);

-- Users can create groups they own
CREATE POLICY "Users can create groups they own" 
  ON user_groups FOR INSERT 
  WITH CHECK (auth.uid() = owner_id);

-- Users can update groups they own
CREATE POLICY "Users can update groups they own" 
  ON user_groups FOR UPDATE 
  USING (auth.uid() = owner_id);

-- Users can delete groups they own
CREATE POLICY "Users can delete groups they own" 
  ON user_groups FOR DELETE 
  USING (auth.uid() = owner_id);

-- ============================================================================
-- FIXED GROUP MEMBERS POLICIES (without circular references)
-- ============================================================================

-- Users can see their own memberships
CREATE POLICY "Users can see their own memberships" 
  ON user_group_members FOR SELECT 
  USING (auth.uid() = user_id);

-- Users can insert memberships for groups they own (for invitations)
CREATE POLICY "Group owners can manage memberships" 
  ON user_group_members FOR INSERT 
  WITH CHECK (
    auth.uid() IN (
      SELECT owner_id FROM user_groups WHERE id = group_id
    )
  );

-- Users can update memberships for groups they own
CREATE POLICY "Group owners can update memberships" 
  ON user_group_members FOR UPDATE 
  USING (
    auth.uid() IN (
      SELECT owner_id FROM user_groups WHERE id = group_id
    )
  );

-- Users can delete memberships for groups they own OR their own membership
CREATE POLICY "Users can manage relevant memberships" 
  ON user_group_members FOR DELETE 
  USING (
    auth.uid() = user_id OR
    auth.uid() IN (
      SELECT owner_id FROM user_groups WHERE id = group_id
    )
  );

-- ============================================================================
-- ADDITIONAL POLICY FOR GROUP ACCESS VIA MEMBERSHIP
-- ============================================================================

-- Add a separate policy that allows users to see groups they are members of
-- This is more explicit and avoids recursion
CREATE POLICY "Users can see groups they are members of" 
  ON user_groups FOR SELECT 
  USING (
    auth.uid() IN (
      SELECT user_id FROM user_group_members WHERE group_id = user_groups.id
    )
  );

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- After running this migration, test with these queries:

-- 1. Test group creation (should work)
-- INSERT INTO user_groups (name, description, owner_id) 
-- VALUES ('Test Group', 'A test group', auth.uid());

-- 2. Test membership creation (should work for group owners)
-- INSERT INTO user_group_members (group_id, user_id, role) 
-- VALUES ('group-id-here', 'user-id-here', 'member');

-- 3. Test group selection (should work without recursion)
-- SELECT * FROM user_groups WHERE auth.uid() = owner_id;

-- 4. Test group selection with membership (should work without recursion)
-- SELECT ug.* FROM user_groups ug 
-- INNER JOIN user_group_members ugm ON ug.id = ugm.group_id 
-- WHERE ugm.user_id = auth.uid(); 