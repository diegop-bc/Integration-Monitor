-- Migration 001: Add User Support to Integration Monitor
-- Purpose: Transform from public feed aggregator to user-based private collections
-- Run this script in your Supabase SQL Editor

-- ============================================================================
-- MIGRATION START: Enable transaction for atomic operations
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Add user_id columns to existing tables
-- ============================================================================

-- Add user_id to feeds table
ALTER TABLE feeds 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to feed_items table (for performance - avoid joins on large datasets)
ALTER TABLE feed_items 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============================================================================
-- STEP 2: Create user groups infrastructure (for future sharing features)
-- ============================================================================

-- User groups table for future team collaboration
CREATE TABLE user_groups (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Group membership table with role-based access
CREATE TABLE user_group_members (
  group_id UUID REFERENCES user_groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

-- ============================================================================
-- STEP 3: Create performance indexes for user-based queries
-- ============================================================================

-- Indexes for user-scoped feed queries
CREATE INDEX idx_feeds_user_id ON feeds(user_id);
CREATE INDEX idx_feeds_user_integration ON feeds(user_id, integration_name);
CREATE INDEX idx_feeds_user_created_at ON feeds(user_id, created_at DESC);

-- Indexes for user-scoped feed_items queries
CREATE INDEX idx_feed_items_user_id ON feed_items(user_id);
CREATE INDEX idx_feed_items_user_pub_date ON feed_items(user_id, pub_date DESC);
CREATE INDEX idx_feed_items_user_integration ON feed_items(user_id, integration_name);

-- Indexes for group functionality (future use)
CREATE INDEX idx_user_groups_owner ON user_groups(owner_id);
CREATE INDEX idx_group_members_user ON user_group_members(user_id);
CREATE INDEX idx_group_members_group ON user_group_members(group_id);

-- ============================================================================
-- STEP 4: Update triggers for new tables
-- ============================================================================

-- Add updated_at trigger for user_groups table
CREATE TRIGGER update_user_groups_updated_at 
    BEFORE UPDATE ON user_groups 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- STEP 5: Update Row Level Security (RLS) policies
-- ============================================================================

-- Drop existing public policies
DROP POLICY IF EXISTS "Allow public read access on feeds" ON feeds;
DROP POLICY IF EXISTS "Allow public insert access on feeds" ON feeds;
DROP POLICY IF EXISTS "Allow public update access on feeds" ON feeds;

DROP POLICY IF EXISTS "Allow public read access on feed_items" ON feed_items;
DROP POLICY IF EXISTS "Allow public insert access on feed_items" ON feed_items;

-- Create user-scoped policies for feeds
CREATE POLICY "Users can only see their own feeds" 
  ON feeds FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own feeds" 
  ON feeds FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only update their own feeds" 
  ON feeds FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own feeds" 
  ON feeds FOR DELETE 
  USING (auth.uid() = user_id);

-- Create user-scoped policies for feed_items
CREATE POLICY "Users can only see their own feed_items" 
  ON feed_items FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own feed_items" 
  ON feed_items FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own feed_items" 
  ON feed_items FOR DELETE 
  USING (auth.uid() = user_id);

-- RLS policies for user groups (future use)
ALTER TABLE user_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see groups they own or belong to" 
  ON user_groups FOR SELECT 
  USING (
    auth.uid() = owner_id OR 
    auth.uid() IN (
      SELECT user_id FROM user_group_members 
      WHERE group_id = user_groups.id
    )
  );

CREATE POLICY "Users can only create groups they own" 
  ON user_groups FOR INSERT 
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can only update groups they own" 
  ON user_groups FOR UPDATE 
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can only delete groups they own" 
  ON user_groups FOR DELETE 
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can see memberships for groups they belong to" 
  ON user_group_members FOR SELECT 
  USING (
    auth.uid() = user_id OR 
    auth.uid() IN (
      SELECT owner_id FROM user_groups 
      WHERE id = user_group_members.group_id
    )
  );

-- ============================================================================
-- STEP 6: Create helper functions for data migration (if needed)
-- ============================================================================

-- Function to assign existing data to a specific user (run manually if needed)
CREATE OR REPLACE FUNCTION assign_feeds_to_user(target_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Update feeds without user_id
  UPDATE feeds 
  SET user_id = target_user_id 
  WHERE user_id IS NULL;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  -- Update corresponding feed_items
  UPDATE feed_items 
  SET user_id = target_user_id 
  WHERE user_id IS NULL;
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- MIGRATION COMMIT
-- ============================================================================

COMMIT;

-- ============================================================================
-- POST-MIGRATION NOTES
-- ============================================================================

-- 1. IMPORTANT: Existing data will have NULL user_id values
--    You'll need to either:
--    a) Delete existing data: DELETE FROM feeds WHERE user_id IS NULL;
--    b) Assign to a user: SELECT assign_feeds_to_user('user-uuid-here');

-- 2. After handling existing data, you may want to make user_id NOT NULL:
--    ALTER TABLE feeds ALTER COLUMN user_id SET NOT NULL;
--    ALTER TABLE feed_items ALTER COLUMN user_id SET NOT NULL;

-- 3. Test the migration by:
--    - Creating a new user account
--    - Adding feeds through the application
--    - Verifying RLS policies work correctly

-- ============================================================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================================================

-- Uncomment and run if you need to rollback this migration:
-- 
-- BEGIN;
-- 
-- -- Drop new tables
-- DROP TABLE IF EXISTS user_group_members CASCADE;
-- DROP TABLE IF EXISTS user_groups CASCADE;
-- 
-- -- Drop new indexes
-- DROP INDEX IF EXISTS idx_feeds_user_id;
-- DROP INDEX IF EXISTS idx_feeds_user_integration;
-- DROP INDEX IF EXISTS idx_feeds_user_created_at;
-- DROP INDEX IF EXISTS idx_feed_items_user_id;
-- DROP INDEX IF EXISTS idx_feed_items_user_pub_date;
-- DROP INDEX IF EXISTS idx_feed_items_user_integration;
-- 
-- -- Remove user_id columns
-- ALTER TABLE feeds DROP COLUMN IF EXISTS user_id;
-- ALTER TABLE feed_items DROP COLUMN IF EXISTS user_id;
-- 
-- -- Restore original policies
-- DROP POLICY IF EXISTS "Users can only see their own feeds" ON feeds;
-- DROP POLICY IF EXISTS "Users can only insert their own feeds" ON feeds;
-- DROP POLICY IF EXISTS "Users can only update their own feeds" ON feeds;
-- DROP POLICY IF EXISTS "Users can only delete their own feeds" ON feeds;
-- 
-- DROP POLICY IF EXISTS "Users can only see their own feed_items" ON feed_items;
-- DROP POLICY IF EXISTS "Users can only insert their own feed_items" ON feed_items;
-- DROP POLICY IF EXISTS "Users can only delete their own feed_items" ON feed_items;
-- 
-- CREATE POLICY "Allow public read access on feeds" ON feeds FOR SELECT USING (true);
-- CREATE POLICY "Allow public insert access on feeds" ON feeds FOR INSERT WITH CHECK (true);
-- CREATE POLICY "Allow public update access on feeds" ON feeds FOR UPDATE USING (true);
-- 
-- CREATE POLICY "Allow public read access on feed_items" ON feed_items FOR SELECT USING (true);
-- CREATE POLICY "Allow public insert access on feed_items" ON feed_items FOR INSERT WITH CHECK (true);
-- 
-- -- Drop helper function
-- DROP FUNCTION IF EXISTS assign_feeds_to_user(UUID);
-- 
-- COMMIT; 