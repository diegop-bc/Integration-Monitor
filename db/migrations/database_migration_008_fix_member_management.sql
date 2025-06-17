-- Migration 008: Fix Member Management Complete Solution
-- Purpose: Complete solution for member management issues
-- - Add user profiles table and RPC functions
-- - Fix RLS policies for proper member access
-- - Eliminate 403 errors from auth.admin calls
-- Date: 2024-01-XX

-- ============================================================================
-- MIGRATION START: Enable transaction for atomic operations
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Create user profiles table (if not exists)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance (if not exists)
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_name ON user_profiles(name);

-- Add updated_at trigger (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_profiles_updated_at'
  ) THEN
    CREATE TRIGGER update_user_profiles_updated_at 
        BEFORE UPDATE ON user_profiles 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================================================
-- STEP 2: Enable RLS on user profiles
-- ============================================================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON user_profiles;

-- Create policies
CREATE POLICY "Users can view all profiles" 
  ON user_profiles FOR SELECT 
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own profile" 
  ON user_profiles FOR UPDATE 
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" 
  ON user_profiles FOR INSERT 
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- STEP 3: Create RPC function to get group members with profile data
-- ============================================================================

CREATE OR REPLACE FUNCTION get_group_members_with_profiles(group_uuid UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  email TEXT,
  name TEXT,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT,
  joined_at TIMESTAMP WITH TIME ZONE,
  last_sign_in_at TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user has access to this group
  IF NOT EXISTS (
    SELECT 1 FROM user_group_members ugm
    WHERE ugm.group_id = group_uuid AND ugm.user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM user_groups ug
    WHERE ug.id = group_uuid AND ug.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied to group';
  END IF;

  RETURN QUERY
  SELECT 
    ugm.user_id as id,
    ugm.user_id,
    COALESCE(up.email, au.email) as email,
    up.name,
    up.full_name,
    up.avatar_url,
    ugm.role,
    ugm.joined_at,
    au.last_sign_in_at
  FROM user_group_members ugm
  LEFT JOIN user_profiles up ON ugm.user_id = up.id
  LEFT JOIN auth.users au ON ugm.user_id = au.id
  WHERE ugm.group_id = group_uuid
  ORDER BY ugm.joined_at ASC;
END;
$$;

-- ============================================================================
-- STEP 4: Create RPC function to get group invitations with inviter data
-- ============================================================================

CREATE OR REPLACE FUNCTION get_group_invitations_with_profiles(group_uuid UUID)
RETURNS TABLE (
  id UUID,
  group_id UUID,
  invited_email TEXT,
  invited_by UUID,
  invited_by_name TEXT,
  invited_by_email TEXT,
  role TEXT,
  token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  accepted_at TIMESTAMP WITH TIME ZONE,
  is_expired BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user has permission to view invitations (owner or admin)
  IF NOT EXISTS (
    SELECT 1 FROM user_groups ug
    WHERE ug.id = group_uuid AND ug.owner_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM user_group_members ugm
    WHERE ugm.group_id = group_uuid AND ugm.user_id = auth.uid() AND ugm.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied to group invitations';
  END IF;

  RETURN QUERY
  SELECT 
    gi.id,
    gi.group_id,
    gi.invited_email,
    gi.invited_by,
    COALESCE(up.name, up.full_name, au.email, 'Usuario desconocido') as invited_by_name,
    au.email as invited_by_email,
    gi.role,
    gi.token,
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

-- ============================================================================
-- STEP 5: Create function to check if email exists
-- ============================================================================

CREATE OR REPLACE FUNCTION check_email_exists(check_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users
    WHERE email = check_email
  );
END;
$$;

-- ============================================================================
-- STEP 6: Create function to sync user profile on signup/login
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_profiles (id, email, name, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = NEW.email,
    name = COALESCE(NEW.raw_user_meta_data->>'name', user_profiles.name),
    full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', user_profiles.full_name),
    updated_at = NOW();
  
  RETURN NEW;
END;
$$;

-- Create trigger to sync profile on user creation/update (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'sync_user_profile_trigger'
  ) THEN
    CREATE TRIGGER sync_user_profile_trigger
      AFTER INSERT OR UPDATE ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION sync_user_profile();
  END IF;
END $$;

-- ============================================================================
-- STEP 7: Update RLS policies for better member management
-- ============================================================================

-- Drop existing restrictive policies for user_group_members
DROP POLICY IF EXISTS "Users can see their own memberships" ON user_group_members;
DROP POLICY IF EXISTS "Users can see memberships for groups they belong to" ON user_group_members;
DROP POLICY IF EXISTS "Users can see groups they are members of" ON user_group_members;

-- Create comprehensive policy for viewing memberships
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

-- Drop existing policies for group_invitations
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

-- ============================================================================
-- STEP 8: Migrate existing users to profiles table
-- ============================================================================

-- Insert profiles for existing users
INSERT INTO user_profiles (id, email, name, full_name)
SELECT 
  id,
  email,
  raw_user_meta_data->>'name',
  raw_user_meta_data->>'full_name'
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = COALESCE(EXCLUDED.name, user_profiles.name),
  full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name),
  updated_at = NOW();

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================================

-- Test the new functions:
-- SELECT COUNT(*) FROM user_profiles;
-- SELECT * FROM get_group_members_with_profiles('your-group-id');
-- SELECT * FROM get_group_invitations_with_profiles('your-group-id');
-- SELECT check_email_exists('test@example.com'); 