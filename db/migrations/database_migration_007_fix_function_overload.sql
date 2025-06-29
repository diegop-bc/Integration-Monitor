-- Migration 007: Fix Function Overload Conflict
-- Purpose: Resolve function overload conflict for accept_group_invitation
-- Issue: Two versions exist - one with UUID parameter, one with TEXT parameter
-- This causes "Could not choose the best candidate function" error
-- Date: 2024-01-XX

-- ============================================================================
-- MIGRATION START: Enable transaction for atomic operations
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Drop the conflicting UUID version of the function
-- ============================================================================

-- Drop the UUID version that conflicts with the TEXT version
DROP FUNCTION IF EXISTS accept_group_invitation(UUID, TEXT);

-- ============================================================================
-- STEP 2: Ensure the TEXT version exists and is properly defined
-- ============================================================================

-- Recreate the function with TEXT parameter (the correct one)
-- This handles tokens generated by crypto.randomUUID() which are strings
CREATE OR REPLACE FUNCTION accept_group_invitation(
  invitation_token TEXT,
  user_email TEXT
) RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  invitation_record group_invitations%ROWTYPE;
  user_record auth.users%ROWTYPE;
  result JSONB;
BEGIN
  -- Log the attempt for debugging
  RAISE LOG 'Attempting to accept invitation with token: % for email: %', invitation_token, user_email;
  
  -- Get the invitation
  SELECT * INTO invitation_record
  FROM group_invitations
  WHERE token = invitation_token
    AND invited_email = user_email
    AND accepted_at IS NULL
    AND expires_at > NOW();
    
  -- Check if invitation exists and is valid
  IF NOT FOUND THEN
    RAISE LOG 'Invitation not found or invalid for token: % email: %', invitation_token, user_email;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid or expired invitation'
    );
  END IF;
  
  -- Log successful invitation found
  RAISE LOG 'Found valid invitation: % for group: %', invitation_record.id, invitation_record.group_id;
  
  -- Get current user
  SELECT * INTO user_record FROM auth.users WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE LOG 'No authenticated user found';
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User must be authenticated'
    );
  END IF;
  
  -- Verify email matches
  IF user_record.email != user_email THEN
    RAISE LOG 'Email mismatch: user email % vs invitation email %', user_record.email, user_email;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Email mismatch'
    );
  END IF;
  
  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM user_group_members
    WHERE group_id = invitation_record.group_id
      AND user_id = auth.uid()
  ) THEN
    RAISE LOG 'User is already a member of group: %', invitation_record.group_id;
    -- Mark invitation as accepted even if already a member
    UPDATE group_invitations
    SET accepted_at = NOW()
    WHERE id = invitation_record.id;
    
    RETURN jsonb_build_object(
      'success', true,
      'group_id', invitation_record.group_id,
      'role', invitation_record.role,
      'message', 'Already a member'
    );
  END IF;
  
  -- Add user to group
  INSERT INTO user_group_members (group_id, user_id, role)
  VALUES (invitation_record.group_id, auth.uid(), invitation_record.role);
  
  RAISE LOG 'Added user % to group % with role %', auth.uid(), invitation_record.group_id, invitation_record.role;
  
  -- Mark invitation as accepted
  UPDATE group_invitations
  SET accepted_at = NOW()
  WHERE id = invitation_record.id;
  
  RAISE LOG 'Marked invitation % as accepted', invitation_record.id;
  
  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'group_id', invitation_record.group_id,
    'role', invitation_record.role
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log error and return failure
    RAISE LOG 'Error accepting invitation: % - %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Failed to accept invitation: ' || SQLERRM
    );
END;
$$;

-- ============================================================================
-- STEP 3: Grant proper permissions
-- ============================================================================

-- Grant execute permission to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION accept_group_invitation(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_group_invitation(TEXT, TEXT) TO anon;

-- ============================================================================
-- MIGRATION COMMIT
-- ============================================================================

COMMIT;

-- ============================================================================
-- POST-MIGRATION NOTES
-- ============================================================================

-- MIGRATION SUMMARY:
-- ✅ Removed conflicting UUID version of accept_group_invitation
-- ✅ Ensured only TEXT version exists (matches crypto.randomUUID() output)
-- ✅ Fixed function overload ambiguity error
-- ✅ Maintained all functionality and security

-- SECURITY CONSIDERATIONS:
-- - Function remains SECURITY DEFINER for proper RLS bypass
-- - All validation and logging preserved
-- - Permissions maintained for both authenticated and anonymous users

-- TESTING:
-- After running this migration, test that:
-- 1. Invitation acceptance works without overload errors
-- 2. Both new user signup and existing user login flows work
-- 3. Function logs show proper debugging information
-- 4. No other parts of the system are affected

-- VERIFICATION QUERY:
-- SELECT routine_name, specific_name, data_type 
-- FROM information_schema.parameters 
-- WHERE routine_name = 'accept_group_invitation'
-- ORDER BY ordinal_position; 