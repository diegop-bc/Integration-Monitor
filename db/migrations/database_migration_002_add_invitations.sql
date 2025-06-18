-- Migration 002: Add Group Invitations Support
-- Purpose: Add invitation system for groups to support member invitations
-- Run this script in your Supabase SQL Editor AFTER migration 001

-- ============================================================================
-- MIGRATION START: Enable transaction for atomic operations
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Create group invitations table
-- ============================================================================

CREATE TABLE group_invitations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  group_id UUID REFERENCES user_groups(id) ON DELETE CASCADE NOT NULL,
  invited_email TEXT NOT NULL,
  invited_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accepted_at TIMESTAMP WITH TIME ZONE NULL
);

-- ============================================================================
-- STEP 2: Create indexes for performance
-- ============================================================================

CREATE INDEX idx_group_invitations_group_id ON group_invitations(group_id);
CREATE INDEX idx_group_invitations_token ON group_invitations(token);
CREATE INDEX idx_group_invitations_email ON group_invitations(invited_email);
CREATE INDEX idx_group_invitations_invited_by ON group_invitations(invited_by);
CREATE INDEX idx_group_invitations_expires_at ON group_invitations(expires_at);

-- ============================================================================
-- STEP 3: Add updated_at trigger
-- ============================================================================

-- Note: No need for updated_at trigger since invitations are mostly insert-only
-- Only the accepted_at field gets updated when invitation is accepted

-- ============================================================================
-- STEP 4: Set up Row Level Security (RLS)
-- ============================================================================

ALTER TABLE group_invitations ENABLE ROW LEVEL SECURITY;

-- Users can see invitations for groups they own or are admins of
CREATE POLICY "Users can see invitations for their groups" 
  ON group_invitations FOR SELECT 
  USING (
    auth.uid() = invited_by OR 
    auth.uid() IN (
      SELECT owner_id FROM user_groups 
      WHERE id = group_invitations.group_id
    ) OR
    auth.uid() IN (
      SELECT user_id FROM user_group_members 
      WHERE group_id = group_invitations.group_id 
      AND role IN ('admin', 'owner')
    )
  );

-- Users can create invitations for groups they own or are admins of
CREATE POLICY "Users can create invitations for their groups" 
  ON group_invitations FOR INSERT 
  WITH CHECK (
    auth.uid() IN (
      SELECT owner_id FROM user_groups 
      WHERE id = group_invitations.group_id
    ) OR
    auth.uid() IN (
      SELECT user_id FROM user_group_members 
      WHERE group_id = group_invitations.group_id 
      AND role IN ('admin', 'owner')
    )
  );

-- Users can update invitations they created or for groups they own/admin
CREATE POLICY "Users can update invitations for their groups" 
  ON group_invitations FOR UPDATE 
  USING (
    auth.uid() = invited_by OR 
    auth.uid() IN (
      SELECT owner_id FROM user_groups 
      WHERE id = group_invitations.group_id
    ) OR
    auth.uid() IN (
      SELECT user_id FROM user_group_members 
      WHERE group_id = group_invitations.group_id 
      AND role IN ('admin', 'owner')
    )
  );

-- Users can delete invitations they created or for groups they own/admin
CREATE POLICY "Users can delete invitations for their groups" 
  ON group_invitations FOR DELETE 
  USING (
    auth.uid() = invited_by OR 
    auth.uid() IN (
      SELECT owner_id FROM user_groups 
      WHERE id = group_invitations.group_id
    ) OR
    auth.uid() IN (
      SELECT user_id FROM user_group_members 
      WHERE group_id = group_invitations.group_id 
      AND role IN ('admin', 'owner')
    )
  );

-- ============================================================================
-- STEP 5: Update user_group_members to support 'viewer' role
-- ============================================================================

-- Update the role check constraint to include 'viewer'
ALTER TABLE user_group_members DROP CONSTRAINT IF EXISTS user_group_members_role_check;
ALTER TABLE user_group_members ADD CONSTRAINT user_group_members_role_check 
  CHECK (role IN ('owner', 'admin', 'member', 'viewer'));

-- ============================================================================
-- STEP 6: Add helper functions for invitation management
-- ============================================================================

-- Function to clean up expired invitations (can be run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_invitations()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM group_invitations 
  WHERE expires_at < NOW() 
  AND accepted_at IS NULL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if email is already a member of a group
CREATE OR REPLACE FUNCTION is_email_group_member(group_uuid UUID, email_address TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_group_members ugm
    JOIN auth.users u ON ugm.user_id = u.id
    WHERE ugm.group_id = group_uuid 
    AND u.email = email_address
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- MIGRATION COMMIT
-- ============================================================================

COMMIT;

-- ============================================================================
-- POST-MIGRATION NOTES
-- ============================================================================

-- 1. Test the migration by:
--    - Creating a group invitation through the application
--    - Verifying RLS policies work correctly
--    - Testing invitation acceptance flow

-- 2. Consider setting up a cron job to run cleanup_expired_invitations() periodically

-- 3. For production, consider adding rate limiting to prevent spam invitations

-- 4. The invitation system supports both existing users and new user signups
--    - Existing users can be added directly to groups
--    - New users get invitation tokens for signup + group membership 