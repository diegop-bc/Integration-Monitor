# Database Migration Guide - Phase 1: User Support

## 🚀 Running the Migration

### Prerequisites
- [ ] Access to your Supabase dashboard
- [ ] Backup of existing data (if you have important data)
- [ ] Understanding that this will change access patterns (existing data becomes inaccessible until assigned to a user)

### Steps to Run Migration

1. **Open Supabase SQL Editor**
   - Go to your Supabase project dashboard
   - Navigate to "SQL Editor" from the left sidebar

2. **Execute the Migration**
   - Copy the entire content from `database_migration_001_add_user_support.sql`
   - Paste it into the SQL Editor
   - Click "Run" to execute

3. **Handle Existing Data (Choose One)**
   
   **Option A: Delete existing data** (if you don't need it)
   ```sql
   DELETE FROM feed_items WHERE user_id IS NULL;
   DELETE FROM feeds WHERE user_id IS NULL;
   ```
   
   **Option B: Assign existing data to a user** (if you want to keep it)
   ```sql
   -- First, create a test user or use an existing user ID
   -- You can find user IDs in the auth.users table
   SELECT assign_feeds_to_user('your-user-uuid-here');
   ```

4. **Optional: Make user_id Required** (after handling existing data)
   ```sql
   ALTER TABLE feeds ALTER COLUMN user_id SET NOT NULL;
   ALTER TABLE feed_items ALTER COLUMN user_id SET NOT NULL;
   ```

### ✅ Validation Steps

After running the migration, validate it worked correctly:

1. **Check Tables Structure**
   ```sql
   -- Verify user_id columns were added
   \d feeds
   \d feed_items
   
   -- Check new tables exist
   \d user_groups
   \d user_group_members
   ```

2. **Check RLS Policies**
   ```sql
   -- List policies for feeds table
   SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
   FROM pg_policies WHERE tablename IN ('feeds', 'feed_items');
   ```

3. **Test User Isolation** (requires authentication setup)
   - Create a test user account
   - Try adding a feed
   - Verify only that user can see their feed

### 🔄 Rollback (if needed)

If something goes wrong, uncomment and run the rollback script at the bottom of the migration file.

### ⚠️ Important Notes

- **Data Access**: After migration, existing data won't be visible until assigned to a user
- **RLS Policies**: The migration enforces strict user isolation
- **Performance**: New indexes are added for user-scoped queries
- **Future Ready**: Group tables are created but not used yet

### 🎯 What This Migration Accomplishes

✅ **All Phase 1 Steps Completed:**
- [x] **1.1** Database migration script created
- [x] **1.2** feeds table updated with user_id foreign key  
- [x] **1.3** feed_items table updated with user_id for performance
- [x] **1.4** User groups table structure added (for future use)
- [x] **1.5** RLS policies updated to enforce user-based access
- [x] **1.6** Ready to test migration script in Supabase dashboard

### 🔜 Next Steps

After successful migration, you'll be ready for **Phase 2: Authentication Foundation** which will involve:
- Setting up Supabase client configuration with auth
- Creating authentication context and provider
- Implementing login/signup components 