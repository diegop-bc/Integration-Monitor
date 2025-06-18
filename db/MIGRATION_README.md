# Database Migrations - integrations.me

## Identified Problem

The system is failing when trying to get user information because it's using `supabase.auth.admin.getUserById()` from the frontend, which requires admin privileges that are not available.

**Typical error:**
```
GET | 403 | auth/v1/admin/users/USER_ID
x_sb_error_code: "not_admin"
```

## Implemented Solution

We have created a user profiles table and RPC functions that run with elevated privileges to get user information without using `auth.admin`.

## Migrations to Apply

### 1. Migration 006: Profiles Table and RPC Functions
**File:** `database_migration_006_add_user_profiles.sql`

This migration creates:
- `user_profiles` table to store basic user information
- RPC function `get_group_members_with_profiles()` to get members with their profiles
- RPC function `get_group_invitations_with_profiles()` to get invitations with inviter information
- RPC function `check_email_exists()` to check if an email exists
- Automatic trigger to sync profiles when a user is created/updated

### 2. Migration 007: Permission Fixes
**File:** `database_migration_007_fix_member_permissions.sql`

This migration fixes:
- RLS policies so owners can see ALL members of their groups
- RLS policies so owners can see ALL invitations of their groups
- Appropriate permissions for group administrators

## Application Instructions

### Step 1: Apply Migration 006
1. Go to the Supabase SQL editor
2. Copy and paste all content from `database_migration_006_add_user_profiles.sql`
3. Execute the migration

### Step 2: Apply Migration 007
1. Go to the Supabase SQL editor
2. Copy and paste all content from `database_migration_007_fix_member_permissions.sql`
3. Execute the migration

### Step 3: Verify the Migration
Execute these queries to verify that everything works:

```sql
-- Verify that the profiles table exists
SELECT COUNT(*) FROM user_profiles;

-- Test members function (replace 'your-group-id' with a real ID)
SELECT * FROM get_group_members_with_profiles('your-group-id');

-- Test invitations function
SELECT * FROM get_group_invitations_with_profiles('your-group-id');

-- Test email verification
SELECT check_email_exists('test@example.com');
```

## Code Changes

The `memberService.ts` has already been updated to use the new RPC functions instead of `auth.admin.getUserById()`.

### Before:
```typescript
const { data: userProfile } = await supabase.auth.admin.getUserById(member.user_id);
```

### After:
```typescript
const { data: members } = await supabase.rpc('get_group_members_with_profiles', { group_uuid: groupId });
```

## Solution Benefits

1. **Eliminates 403 errors**: No longer uses admin functions from the frontend
2. **Improves performance**: A single RPC query instead of multiple auth.admin calls
3. **Correct permissions**: Owners can see all members and invitations
4. **Automatic synchronization**: Profiles are updated automatically when user metadata changes
5. **Scalability**: Works efficiently even with many members

## Post-Migration Verification

After applying the migrations, verify that:

1. ✅ Owners can see the complete list of members
2. ✅ Owners can see all pending invitations
3. ✅ No more 403 errors in the console
4. ✅ User information (names, emails) is displayed correctly
5. ✅ New users who register automatically appear in the profiles table

## Rollback (if necessary)

If you need to revert the changes:

```sql
-- Revert migration 007
DROP POLICY IF EXISTS "Users can see memberships in groups they own or belong to" ON user_group_members;
DROP POLICY IF EXISTS "Users can see invitations for groups they can manage" ON group_invitations;
-- ... etc

-- Revert migration 006
DROP FUNCTION IF EXISTS get_group_members_with_profiles(UUID);
DROP FUNCTION IF EXISTS get_group_invitations_with_profiles(UUID);
DROP TABLE IF EXISTS user_profiles CASCADE;
``` 