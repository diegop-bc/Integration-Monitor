-- Migration 016: Add function to get user personal feeds
-- Description: Creates a specific RPC function to fetch only personal feeds (group_id IS NULL) for a user

-- Create function to get user personal feeds only
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
  -- Return only feeds that belong to the user and have no group (personal feeds)
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
    AND f.group_id IS NULL  -- Only personal feeds (not group feeds)
  ORDER BY f.created_at DESC;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_user_personal_feeds(UUID) TO authenticated;

-- Create function to get user owned group feeds (for fallback when no personal feeds exist)
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
    g.name as group_name,
    gm.role as user_role
  FROM feeds f
  INNER JOIN groups g ON f.group_id = g.id
  INNER JOIN group_members gm ON g.id = gm.group_id
  WHERE gm.user_id = user_uuid 
    AND gm.role = 'owner'  -- Only groups where user is owner
  ORDER BY f.created_at DESC;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_user_owned_group_feeds(UUID) TO authenticated; 