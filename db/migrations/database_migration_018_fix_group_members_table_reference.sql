-- Migration 018: Fix group_members table references
-- Description: Corrects all functions to use user_group_members table instead of group_members

-- Drop and recreate the function with correct table reference
DROP FUNCTION IF EXISTS get_user_owned_group_feeds(UUID);

CREATE OR REPLACE FUNCTION get_user_owned_group_feeds(user_uuid UUID)
RETURNS TABLE (
  id UUID,
  url TEXT,
  title TEXT,
  description TEXT,
  integration_name TEXT,
  integration_alias TEXT,
  last_fetched TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  user_id UUID,
  group_id UUID,
  group_name TEXT,
  user_role TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Return feeds from groups where the user is an owner
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
    ug.name as group_name,
    ugm.role as user_role
  FROM feeds f
  INNER JOIN user_groups ug ON f.group_id = ug.id
  INNER JOIN user_group_members ugm ON ug.id = ugm.group_id
  WHERE ugm.user_id = user_uuid 
    AND ugm.role = 'owner'  -- Only groups where user is owner
  ORDER BY f.created_at DESC;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_user_owned_group_feeds(UUID) TO authenticated;

-- Verify get_user_personal_feeds function also exists and is correct
DROP FUNCTION IF EXISTS get_user_personal_feeds(UUID);

CREATE OR REPLACE FUNCTION get_user_personal_feeds(user_uuid UUID)
RETURNS TABLE (
  id UUID,
  url TEXT,
  title TEXT,
  description TEXT,
  integration_name TEXT,
  integration_alias TEXT,
  last_fetched TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  user_id UUID,
  group_id UUID
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Return personal feeds (group_id IS NULL) for the authenticated user
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
    f.group_id
  FROM feeds f
  WHERE f.user_id = user_uuid 
    AND f.group_id IS NULL  -- Only personal feeds
  ORDER BY f.created_at DESC;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_user_personal_feeds(UUID) TO authenticated; 