-- Migration 013: Fix user groups list to only show groups where user is a member
-- Date: 2024-12-19
-- Description: Create a new function to get only groups where user is actually a member,
--              separate from groups that are just publicly accessible.

-- Function to get only groups where user is a member (for group switcher)
CREATE OR REPLACE FUNCTION get_user_member_groups(user_uuid UUID DEFAULT auth.uid())
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  owner_id UUID,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  is_public BOOLEAN,
  user_role TEXT,
  member_count BIGINT,
  is_owner BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is authenticated
  IF user_uuid IS NULL THEN
    user_uuid := auth.uid();
  END IF;
  
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  RETURN QUERY
  SELECT 
    ug.id,
    ug.name,
    ug.description,
    ug.owner_id,
    ug.created_at,
    ug.updated_at,
    ug.is_public,
    ugm.role as user_role,
    COALESCE(member_counts.count, 0) as member_count,
    (ug.owner_id = user_uuid) as is_owner
  FROM user_groups ug
  JOIN user_group_members ugm ON ug.id = ugm.group_id AND ugm.user_id = user_uuid
  LEFT JOIN (
    SELECT group_id, COUNT(*) as count
    FROM user_group_members
    GROUP BY group_id
  ) member_counts ON ug.id = member_counts.group_id
  ORDER BY ug.name;
END;
$$;

-- Update the get_user_accessible_groups function comment to clarify its purpose
COMMENT ON FUNCTION get_user_accessible_groups(UUID) IS 'Returns all groups a user can access (member groups + public groups). Use get_user_member_groups() for group switcher.';
COMMENT ON FUNCTION get_user_member_groups(UUID) IS 'Returns only groups where user is an actual member. Use this for group switcher/navigation.';

-- Test the new function
-- SELECT * FROM get_user_member_groups();

-- Rollback commands (for reference):
-- DROP FUNCTION IF EXISTS get_user_member_groups(UUID); 