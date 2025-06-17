-- Migration 005: Fix Invitation Acceptance Policies
-- Purpose: Allow users to add themselves to groups when accepting invitations
-- Issue: RLS policies prevent users from inserting into user_group_members when accepting invitations
-- Date: 2024-01-XX

-- ============================================================================
-- MIGRATION START: Enable transaction for atomic operations
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Update RLS policy for user_group_members INSERT to allow invitation acceptance
-- ============================================================================

-- Drop the restrictive INSERT policy
DROP POLICY IF EXISTS "Group owners can manage memberships" ON user_group_members;

-- Create a new policy that allows:
-- 1. Group owners to add members (existing functionality)
-- 2. Users to add themselves when they have a valid invitation
CREATE POLICY "Users can join groups via invitation or ownership" 
  ON user_group_members FOR INSERT 
  WITH CHECK (
    -- Group owners can add anyone
    auth.uid() IN (
      SELECT owner_id FROM user_groups WHERE id = group_id
    )
    OR
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

-- ============================================================================
-- STEP 2: Create a function to handle invitation acceptance atomically
-- ============================================================================

-- Create a function that handles the entire invitation acceptance process
-- This ensures data consistency and proper error handling
CREATE OR REPLACE FUNCTION accept_group_invitation(
  invitation_token UUID,
  user_email TEXT
) RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  invitation_record group_invitations%ROWTYPE;
  result JSONB;
BEGIN
  -- Get the invitation
  SELECT * INTO invitation_record
  FROM group_invitations
  WHERE token = invitation_token
    AND invited_email = user_email
    AND accepted_at IS NULL
    AND expires_at > NOW();
    
  -- Check if invitation exists and is valid
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid or expired invitation'
    );
  END IF;
  
  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM user_group_members
    WHERE group_id = invitation_record.group_id
      AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User is already a member of this group'
    );
  END IF;
  
  -- Add user to group
  INSERT INTO user_group_members (group_id, user_id, role)
  VALUES (invitation_record.group_id, auth.uid(), invitation_record.role);
  
  -- Mark invitation as accepted
  UPDATE group_invitations
  SET accepted_at = NOW()
  WHERE id = invitation_record.id;
  
  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'group_id', invitation_record.group_id,
    'role', invitation_record.role
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log error and return failure
    RAISE LOG 'Error accepting invitation: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Failed to accept invitation: ' || SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION accept_group_invitation(UUID, TEXT) TO authenticated;

-- ============================================================================
-- STEP 3: Create helper function to check if email exists (for better UX)
-- ============================================================================

-- Function to safely check if an email is already registered
-- Returns true if email exists, false otherwise
CREATE OR REPLACE FUNCTION check_email_exists(check_email TEXT)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = auth, public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check if user exists in auth.users
  RETURN EXISTS (
    SELECT 1 FROM auth.users WHERE email = check_email
  );
EXCEPTION
  WHEN OTHERS THEN
    -- If there's any error, assume email doesn't exist
    RETURN false;
END;
$$;

-- Grant execute permission to anonymous users (for invitation flow)
GRANT EXECUTE ON FUNCTION check_email_exists(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION check_email_exists(TEXT) TO authenticated;

-- ============================================================================
-- MIGRATION COMMIT
-- ============================================================================

COMMIT;

-- ============================================================================
-- POST-MIGRATION NOTES
-- ============================================================================

-- MIGRATION SUMMARY:
-- ✅ Updated RLS policy to allow invitation acceptance
-- ✅ Created atomic function for invitation acceptance
-- ✅ Added email existence check function
-- ✅ Maintains security while enabling invitation flow

-- SECURITY CONSIDERATIONS:
-- - Users can only add themselves to groups with valid invitations
-- - Group owners maintain full control over their groups
-- - Invitation acceptance is atomic and handles edge cases
-- - Email check function is safe for anonymous users

-- USAGE:
-- Frontend can now call:
-- SELECT accept_group_invitation('token-uuid', 'user@example.com');
-- SELECT check_email_exists('user@example.com');

-- TESTING:
-- After running this migration, test that:
-- 1. Users can accept invitations successfully
-- 2. Invalid invitations are rejected
-- 3. Users cannot join groups without valid invitations
-- 4. Group owners can still manage memberships normally 