-- Migration 017: Fix function to use correct table name user_groups
-- Description: Corrects the get_user_owned_group_feeds function to use user_groups table instead of groups

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
    gm.role as user_role
  FROM feeds f
  INNER JOIN user_groups ug ON f.group_id = ug.id
  INNER JOIN group_members gm ON ug.id = gm.group_id
  WHERE gm.user_id = user_uuid 
    AND gm.role = 'owner'  -- Only groups where user is owner
  ORDER BY f.created_at DESC;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_user_owned_group_feeds(UUID) TO authenticated; 