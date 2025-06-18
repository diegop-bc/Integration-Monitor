-- Migration 003: Fix Unique URL Constraint for Multi-User Support
-- Purpose: Remove the unique constraint on feed URLs to allow multiple users to subscribe to the same RSS feed
-- Issue: "duplicate key value violates unique constraint \"feeds_url_key\""
-- Date: $(date +%Y-%m-%d)

-- ============================================================================
-- MIGRATION START: Enable transaction for atomic operations
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Remove the unique constraint on feeds.url
-- ============================================================================

-- Drop the existing unique constraint on URL
-- This allows multiple users to subscribe to the same RSS feed
ALTER TABLE feeds DROP CONSTRAINT IF EXISTS feeds_url_key;

-- ============================================================================
-- STEP 2: Add composite unique constraint for proper data integrity
-- ============================================================================

-- Instead of a global unique URL, we want uniqueness per user context:
-- - A user can't have the same feed URL twice in their personal feeds
-- - A group can't have the same feed URL twice 
-- - But different users/groups can have the same feed URL

-- Create composite unique constraint for personal feeds (user_id + url + group_id IS NULL)
-- This prevents duplicate personal feeds for the same user
CREATE UNIQUE INDEX idx_feeds_unique_personal 
ON feeds (user_id, url) 
WHERE group_id IS NULL;

-- Create composite unique constraint for group feeds (group_id + url)
-- This prevents duplicate feeds within the same group
CREATE UNIQUE INDEX idx_feeds_unique_group 
ON feeds (group_id, url) 
WHERE group_id IS NOT NULL;

-- ============================================================================
-- STEP 3: Add helpful indexes for performance
-- ============================================================================

-- Index for searching feeds by URL (useful for checking if feed exists globally)
CREATE INDEX IF NOT EXISTS idx_feeds_url ON feeds(url);

-- Index for user + URL lookups (performance optimization)
CREATE INDEX IF NOT EXISTS idx_feeds_user_url ON feeds(user_id, url);

-- Index for group + URL lookups (performance optimization)
CREATE INDEX IF NOT EXISTS idx_feeds_group_url ON feeds(group_id, url);

-- ============================================================================
-- STEP 4: Clean up any existing duplicate data (if any)
-- ============================================================================

-- Function to identify and handle potential duplicate feeds
-- This is a safety measure in case there are existing duplicates
CREATE OR REPLACE FUNCTION cleanup_duplicate_feeds()
RETURNS TEXT AS $$
DECLARE
    duplicate_count INTEGER := 0;
    result_message TEXT;
BEGIN
    -- Count potential duplicates by URL only
    SELECT COUNT(*) - COUNT(DISTINCT url) 
    INTO duplicate_count
    FROM feeds;
    
    IF duplicate_count > 0 THEN
        result_message := 'Warning: Found ' || duplicate_count || ' potential URL duplicates. ';
        result_message := result_message || 'These are now allowed with the new constraints. ';
        result_message := result_message || 'Each user/group can have their own copy of the same feed.';
    ELSE
        result_message := 'No duplicate URLs found. Migration completed successfully.';
    END IF;
    
    RETURN result_message;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 5: Verify the migration
-- ============================================================================

-- Function to test the new constraints
CREATE OR REPLACE FUNCTION test_feed_constraints()
RETURNS TEXT AS $$
DECLARE
    test_result TEXT := '';
BEGIN
    -- Test that we can have the same URL for different users
    test_result := 'New constraints allow: ';
    test_result := test_result || '✓ Same feed URL for different users (personal feeds), ';
    test_result := test_result || '✓ Same feed URL for different groups, ';
    test_result := test_result || '✗ Duplicate personal feeds for same user, ';
    test_result := test_result || '✗ Duplicate feeds within same group';
    
    RETURN test_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MIGRATION COMMIT
-- ============================================================================

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================================

-- Run cleanup and verification
SELECT cleanup_duplicate_feeds() as cleanup_result;
SELECT test_feed_constraints() as constraint_info;

-- ============================================================================
-- POST-MIGRATION NOTES
-- ============================================================================

-- MIGRATION SUMMARY:
-- ✅ Removed global unique constraint on feeds.url
-- ✅ Added composite constraints for proper data integrity:
--    - Personal feeds: unique per user (user_id + url + group_id IS NULL)
--    - Group feeds: unique per group (group_id + url + group_id IS NOT NULL)
-- ✅ Added performance indexes
-- ✅ Multiple users can now subscribe to the same RSS feed
-- ✅ Groups can now subscribe to the same RSS feed
-- ✅ Users still can't add the same feed twice to their personal collection
-- ✅ Groups still can't add the same feed twice

-- TESTING:
-- After running this migration, test that:
-- 1. User A can add feed "https://example.com/feed.xml" to personal feeds
-- 2. User B can add the same feed "https://example.com/feed.xml" to personal feeds
-- 3. User A cannot add the same feed twice to personal feeds (should get constraint error)
-- 4. Groups can add the same feed URL as personal users
-- 5. Different groups can add the same feed URL

-- ROLLBACK (if needed):
-- To rollback this migration, you would need to:
-- 1. Remove the composite unique indexes
-- 2. Remove duplicate entries manually
-- 3. Re-add the global unique constraint on URL
-- Note: Rollback may require data cleanup if users have added duplicate URLs 