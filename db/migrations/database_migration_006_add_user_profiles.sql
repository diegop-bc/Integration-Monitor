-- Migration 006: Add User Profiles Table and RPC Functions
-- Purpose: Create user profiles table and RPC functions to get user data without auth.admin
-- Date: 2024-01-XX

-- ============================================================================
-- MIGRATION START: Enable transaction for atomic operations
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Create user profiles table
-- ============================================================================

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_user_profiles_email ON user_profiles(email);
CREATE INDEX idx_user_profiles_name ON user_profiles(name);

-- Add updated_at trigger
CREATE TRIGGER update_user_profiles_updated_at 
    BEFORE UPDATE ON user_profiles 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- STEP 2: Enable RLS on user profiles
-- ============================================================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can see all profiles (for group member lists)
CREATE POLICY "Users can view all profiles" 
  ON user_profiles FOR SELECT 
  USING (auth.uid() IS NOT NULL);

-- Users can only update their own profile
CREATE POLICY "Users can update their own profile" 
  ON user_profiles FOR UPDATE 
  USING (auth.uid() = id);

-- Users can insert their own profile
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
-- STEP 5: Create function to sync user profile on signup/login
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

-- Create trigger to sync profile on user creation/update
CREATE TRIGGER sync_user_profile_trigger
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_profile();

-- ============================================================================
-- STEP 6: Create function to update user profile
-- ============================================================================

CREATE OR REPLACE FUNCTION update_user_profile(
  new_name TEXT DEFAULT NULL,
  new_full_name TEXT DEFAULT NULL,
  new_avatar_url TEXT DEFAULT NULL
)
RETURNS user_profiles
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  profile user_profiles;
BEGIN
  UPDATE user_profiles SET
    name = COALESCE(new_name, name),
    full_name = COALESCE(new_full_name, full_name),
    avatar_url = COALESCE(new_avatar_url, avatar_url),
    updated_at = NOW()
  WHERE id = auth.uid()
  RETURNING * INTO profile;

  RETURN profile;
END;
$$;

-- ============================================================================
-- STEP 7: Migrate existing users to profiles table
-- ============================================================================

-- Insert profiles for existing users
INSERT INTO user_profiles (id, email, name, full_name)
SELECT 
  id,
  email,
  raw_user_meta_data->>'name',
  raw_user_meta_data->>'full_name'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- STEP 8: Create function to check if email exists
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

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================================

-- Test the new functions:
-- SELECT * FROM get_group_members_with_profiles('your-group-id');
-- SELECT * FROM get_group_invitations_with_profiles('your-group-id');
-- SELECT update_user_profile('New Name', 'New Full Name', null);
-- SELECT check_email_exists('test@example.com'); 