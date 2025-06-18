-- Migration 007: Fix Member Management Permissions
-- Purpose: Ensure group owners can see all members and manage all memberships
-- Date: 2024-01-XX

-- ============================================================================
-- MIGRATION START: Enable transaction for atomic operations
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Update RLS policies for user_group_members to ensure owners can see all members
-- ============================================================================

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can see their own memberships" ON user_group_members;
DROP POLICY IF EXISTS "Users can see memberships for groups they belong to" ON user_group_members;

-- Create new comprehensive policies for viewing memberships
CREATE POLICY "Users can see memberships in groups they own or belong to" 
  ON user_group_members FOR SELECT 
  USING (
    -- Users can see their own memberships
    auth.uid() = user_id OR
    -- Group owners can see all memberships in their groups
    auth.uid() IN (
      SELECT owner_id FROM user_groups WHERE id = group_id
    ) OR
    -- Group admins can see all memberships in groups they're admin of
    auth.uid() IN (
      SELECT ugm.user_id FROM user_group_members ugm 
      WHERE ugm.group_id = user_group_members.group_id 
      AND ugm.role = 'admin'
    )
  );

-- ============================================================================
-- STEP 2: Update RLS policies for group_invitations to ensure proper access
-- ============================================================================

-- Drop existing policies that might be too restrictive
DROP POLICY IF EXISTS "Users can see invitations for their groups" ON group_invitations;
DROP POLICY IF EXISTS "Users can insert invitations for their groups" ON group_invitations;
DROP POLICY IF EXISTS "Users can update invitations for their groups" ON group_invitations;
DROP POLICY IF EXISTS "Users can delete invitations for their groups" ON group_invitations;

-- Create comprehensive policies for group invitations
CREATE POLICY "Users can see invitations for groups they can manage" 
  ON group_invitations FOR SELECT 
  USING (
    -- Group owners can see all invitations
    auth.uid() IN (
      SELECT owner_id FROM user_groups WHERE id = group_id
    ) OR
    -- Group admins can see all invitations
    auth.uid() IN (
      SELECT ugm.user_id FROM user_group_members ugm 
      WHERE ugm.group_id = group_invitations.group_id 
      AND ugm.role = 'admin'
    )
  );

CREATE POLICY "Users can create invitations for groups they can manage" 
  ON group_invitations FOR INSERT 
  WITH CHECK (
    -- Group owners can create invitations
    auth.uid() IN (
      SELECT owner_id FROM user_groups WHERE id = group_id
    ) OR
    -- Group admins can create invitations
    auth.uid() IN (
      SELECT ugm.user_id FROM user_group_members ugm 
      WHERE ugm.group_id = group_invitations.group_id 
      AND ugm.role = 'admin'
    )
  );

CREATE POLICY "Users can update invitations for groups they can manage" 
  ON group_invitations FOR UPDATE 
  USING (
    -- Group owners can update invitations
    auth.uid() IN (
      SELECT owner_id FROM user_groups WHERE id = group_id
    ) OR
    -- Group admins can update invitations
    auth.uid() IN (
      SELECT ugm.user_id FROM user_group_members ugm 
      WHERE ugm.group_id = group_invitations.group_id 
      AND ugm.role = 'admin'
    ) OR
    -- Users can accept their own invitations
    auth.uid() IN (
      SELECT id FROM auth.users WHERE email = invited_email
    )
  );

CREATE POLICY "Users can delete invitations for groups they can manage" 
  ON group_invitations FOR DELETE 
  USING (
    -- Group owners can delete invitations
    auth.uid() IN (
      SELECT owner_id FROM user_groups WHERE id = group_id
    ) OR
    -- Group admins can delete invitations
    auth.uid() IN (
      SELECT ugm.user_id FROM user_group_members ugm 
      WHERE ugm.group_id = group_invitations.group_id 
      AND ugm.role = 'admin'
    ) OR
    -- Users who created the invitation can delete it
    auth.uid() = invited_by
  );

-- ============================================================================
-- STEP 3: Update user_group_members policies for better management
-- ============================================================================

-- Drop existing management policies
DROP POLICY IF EXISTS "Group owners can manage memberships" ON user_group_members;
DROP POLICY IF EXISTS "Group owners can update memberships" ON user_group_members;
DROP POLICY IF EXISTS "Users can manage relevant memberships" ON user_group_members;
DROP POLICY IF EXISTS "Users can join groups via invitation or ownership" ON user_group_members;

-- Create comprehensive management policies
CREATE POLICY "Users can manage memberships appropriately" 
  ON user_group_members FOR INSERT 
  WITH CHECK (
    -- Group owners can add anyone
    auth.uid() IN (
      SELECT owner_id FROM user_groups WHERE id = group_id
    ) OR
    -- Group admins can add members (not other admins)
    (
      auth.uid() IN (
        SELECT ugm.user_id FROM user_group_members ugm 
        WHERE ugm.group_id = user_group_members.group_id 
        AND ugm.role = 'admin'
      ) AND
      role NOT IN ('admin', 'owner')
    ) OR
    -- Users can add themselves if they have a valid invitation
    (
      auth.uid() = user_id AND
      EXISTS (
        SELECT 1 FROM group_invitations gi
        WHERE gi.group_id = user_group_members.group_id
          AND gi.invited_email = (
            SELECT email FROM auth.users WHERE id = auth.uid()
          )
          AND gi.accepted_at IS NULL
          AND gi.expires_at > NOW()
      )
    )
  );

CREATE POLICY "Users can update memberships appropriately" 
  ON user_group_members FOR UPDATE 
  USING (
    -- Group owners can update any membership
    auth.uid() IN (
      SELECT owner_id FROM user_groups WHERE id = group_id
    ) OR
    -- Group admins can update non-admin memberships
    (
      auth.uid() IN (
        SELECT ugm.user_id FROM user_group_members ugm 
        WHERE ugm.group_id = user_group_members.group_id 
        AND ugm.role = 'admin'
      ) AND
      role NOT IN ('admin', 'owner')
    )
  );

CREATE POLICY "Users can remove memberships appropriately" 
  ON user_group_members FOR DELETE 
  USING (
    -- Group owners can remove any membership (except their own owner status)
    (
      auth.uid() IN (
        SELECT owner_id FROM user_groups WHERE id = group_id
      ) AND
      NOT (user_id = auth.uid() AND role = 'owner')
    ) OR
    -- Group admins can remove non-admin memberships
    (
      auth.uid() IN (
        SELECT ugm.user_id FROM user_group_members ugm 
        WHERE ugm.group_id = user_group_members.group_id 
        AND ugm.role = 'admin'
      ) AND
      role NOT IN ('admin', 'owner')
    ) OR
    -- Users can remove their own membership
    auth.uid() = user_id
  );

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================================

-- Test owner access:
-- 1. Owners should be able to see all members in their groups
-- 2. Owners should be able to see all invitations in their groups
-- 3. Owners should be able to manage all memberships

-- Test admin access:
-- 1. Admins should be able to see all members in groups they admin
-- 2. Admins should be able to manage non-admin memberships
-- 3. Admins should be able to invite new members

-- Test member access:
-- 1. Members should only see their own membership
-- 2. Members should not be able to manage other memberships 