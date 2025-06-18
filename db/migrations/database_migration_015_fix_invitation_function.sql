-- Migration 015: Fix get_group_invitations_with_profiles Function Return Type
-- Purpose: Fix column type mismatch in get_group_invitations_with_profiles function
-- Issue: Returned type character varying(255) does not match expected type text
-- Date: 2024-01-XX

BEGIN;

-- ============================================================================
-- STEP 1: Drop the existing function first
-- ============================================================================

DROP FUNCTION IF EXISTS get_group_invitations_with_profiles(UUID);

-- ============================================================================
-- STEP 2: Recreate the function with correct types
-- ============================================================================

CREATE OR REPLACE FUNCTION get_group_invitations_with_profiles(group_uuid UUID)
RETURNS TABLE (
  id UUID,
  group_id UUID,
  invited_email VARCHAR(255),
  invited_by UUID,
  invited_by_name VARCHAR(255),
  invited_by_email VARCHAR(255),
  role VARCHAR(50),
  token VARCHAR(255),
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
    gi.invited_email::VARCHAR(255),
    gi.invited_by,
    COALESCE(up.name, up.full_name, au.email, 'Usuario desconocido')::VARCHAR(255) as invited_by_name,
    au.email::VARCHAR(255) as invited_by_email,
    gi.role::VARCHAR(50),
    gi.token::VARCHAR(255),
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

COMMIT; 