import { supabase } from '../lib/supabase';
import type { 
  UserGroup, 
  GroupWithMembership, 
  CreateGroupRequest, 
  UpdateGroupRequest,
  PublicGroup,
  PublicGroupFeedsResponse,
  JoinGroupResponse,
  ToggleVisibilityResponse,
  AccessibleGroupsResponse
} from '../types/group';

export class GroupService {
  /**
   * Get all groups for the current user using RPC function
   * Uses the new get_user_member_groups RPC to get only groups where user is a member
   */
  async getUserGroups(): Promise<GroupWithMembership[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Use RPC function to get only groups where user is a member
    const { data: groupsData, error } = await supabase
      .rpc('get_user_member_groups');

    if (error) throw error;

    // Transform data to match our interface
    const groupsWithMembership: GroupWithMembership[] = (groupsData || []).map((group: AccessibleGroupsResponse) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      owner_id: group.owner_id,
      created_at: group.created_at,
      updated_at: group.updated_at,
      is_public: group.is_public,
      role: group.user_role as 'owner' | 'admin' | 'member' | 'viewer',
      member_count: Number(group.member_count),
      integration_count: 0, // Will be calculated separately if needed
      is_owner: group.is_owner,
      can_access: true // If it's returned by RPC, user can access it
    }));

    // Get integration counts for each group
    for (const group of groupsWithMembership) {
      const { count } = await supabase
        .from('feeds')
        .select('*', { count: 'exact' })
        .eq('group_id', group.id);
      
      group.integration_count = count || 0;
    }

    return groupsWithMembership;
  }

  /**
   * Get user's owned groups using RPC function
   */
  async getUserOwnedGroups(): Promise<GroupWithMembership[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Use RPC function to get owned groups
    const { data: groupsData, error } = await supabase
      .rpc('get_user_owned_groups');

    if (error) throw error;

    // Transform data to match our interface
    const groupsWithMembership: GroupWithMembership[] = (groupsData || []).map((group: any) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      owner_id: group.owner_id,
      created_at: group.created_at,
      updated_at: group.updated_at,
      is_public: group.is_public,
      role: 'owner' as const,
      member_count: Number(group.member_count) + 1, // +1 for owner
      integration_count: 0, // Will be calculated separately if needed
      is_owner: true,
      can_access: true
    }));

    // Get integration counts for each group
    for (const group of groupsWithMembership) {
      const { count } = await supabase
        .from('feeds')
        .select('*', { count: 'exact' })
        .eq('group_id', group.id);
      
      group.integration_count = count || 0;
    }

    return groupsWithMembership;
  }

  /**
   * Get a specific group by ID using RPC function
   * Handles both member groups and public groups
   */
  async getGroup(groupId: string): Promise<GroupWithMembership | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Use RPC function to get group with user role
    const { data: groupData, error } = await supabase
      .rpc('get_group_with_user_role', { group_uuid: groupId });

    if (error) throw error;

    if (!groupData || groupData.length === 0) {
      // If group not found via member function, try public group access
      const publicGroup = await this.getPublicGroup(groupId);
      if (publicGroup) {
        // Convert PublicGroup to GroupWithMembership format
        return {
          id: publicGroup.id,
          name: publicGroup.name,
          description: publicGroup.description,
          owner_id: '', // Hidden for public groups
          created_at: publicGroup.created_at,
          updated_at: publicGroup.updated_at,
          is_public: publicGroup.is_public,
          role: publicGroup.user_role as 'viewer', // Public group viewers
          member_count: publicGroup.member_count,
          integration_count: publicGroup.feed_count,
          is_owner: false,
          can_access: true
        };
      }
      return null;
    }

    const group = groupData[0];

    // Get integration count
    const { count: integrationCount } = await supabase
      .from('feeds')
      .select('*', { count: 'exact' })
      .eq('group_id', groupId);

    return {
      id: group.id,
      name: group.name,
      description: group.description,
      owner_id: group.owner_id,
      created_at: group.created_at,
      updated_at: group.updated_at,
      is_public: group.is_public,
      role: group.user_role as 'owner' | 'admin' | 'member' | 'viewer',
      member_count: Number(group.member_count),
      integration_count: integrationCount || 0,
      is_owner: group.is_owner,
      can_access: group.can_access
    };
  }

  /**
   * Get public group information (for non-members)
   */
  async getPublicGroup(groupId: string): Promise<PublicGroup | null> {
    try {
      // Use RPC function to get public group stats
      const { data: statsData, error: statsError } = await supabase
        .rpc('get_public_group_stats', { group_uuid: groupId });

      if (statsError) {
        // If error is because group is not public, return null
        if (statsError.message?.includes('not public')) {
          return null;
        }
        throw statsError;
      }

      if (!statsData || statsData.length === 0) {
        return null;
      }

      const stats = statsData[0];
      const { data: { user } } = await supabase.auth.getUser();

      // Determine user's current role and if they can join
      let userRole: 'none' | 'viewer' | 'member' | 'admin' | 'owner' = 'none';
      let canJoin = false;

      if (user) {
        // Use RPC function to check group membership to avoid RLS issues
        try {
          const { data: groupWithRole } = await supabase
            .rpc('get_group_with_user_role', { 
              group_uuid: groupId 
            });

          if (groupWithRole && groupWithRole.length > 0) {
            const groupInfo = groupWithRole[0];
            userRole = groupInfo.user_role || 'none';
            canJoin = userRole === 'none'; // Can join if not already a member
          } else {
            // User is not a member, can join
            canJoin = true;
          }
        } catch (membershipError) {
          // If we can't check membership (e.g., user not in group), assume they can join
          canJoin = true;
        }
      } else {
        // Not authenticated, can't join but can view
        canJoin = false;
      }

      return {
        id: stats.id,
        name: stats.name,
        description: stats.description,
        created_at: stats.created_at,
        updated_at: stats.created_at, // Using created_at as fallback
        is_public: true,
        member_count: Number(stats.member_count),
        feed_count: Number(stats.feed_count),
        total_feed_items: Number(stats.total_feed_items),
        last_activity: stats.last_activity,
        user_role: userRole,
        can_join: canJoin
      };
    } catch (error) {
      console.error('Error getting public group:', error);
      return null;
    }
  }

  /**
   * Get public group feeds
   */
  async getPublicGroupFeeds(groupId: string): Promise<PublicGroupFeedsResponse[]> {
    const { data: feedsData, error } = await supabase
      .rpc('get_public_group_feeds', { group_uuid: groupId });

    if (error) throw error;

    return feedsData || [];
  }

  /**
   * Join a public group
   */
  async joinPublicGroup(groupId: string): Promise<JoinGroupResponse> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: result, error } = await supabase
      .rpc('join_public_group', { group_uuid: groupId });

    if (error) throw error;

    if (!result || result.length === 0) {
      return { success: false, message: 'Failed to join group' };
    }

    return result[0];
  }

  /**
   * Toggle group visibility (public/private)
   */
  async toggleGroupVisibility(groupId: string, isPublic: boolean): Promise<ToggleVisibilityResponse> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: result, error } = await supabase
      .rpc('toggle_group_visibility', { 
        group_uuid: groupId, 
        make_public: isPublic 
      });

    if (error) throw error;

    if (!result || result.length === 0) {
      return { success: false, message: 'Failed to update group visibility' };
    }

    return result[0];
  }

  /**
   * Create a new group
   */
  async createGroup(groupData: CreateGroupRequest): Promise<UserGroup> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Create the group
    const { data: group, error: groupError } = await supabase
      .from('user_groups')
      .insert({
        name: groupData.name,
        description: groupData.description,
        owner_id: user.id,
        is_public: groupData.is_public || false // Default to private
      })
      .select()
      .single();

    if (groupError) throw groupError;

    // Add the creator as owner member
    const { error: membershipError } = await supabase
      .from('user_group_members')
      .insert({
        group_id: group.id,
        user_id: user.id,
        role: 'owner'
      });

    if (membershipError) {
      // Cleanup: delete the group if membership creation failed
      await supabase.from('user_groups').delete().eq('id', group.id);
      throw membershipError;
    }

    return group;
  }

  /**
   * Update an existing group (owner/admin only)
   */
  async updateGroup(groupId: string, updateData: UpdateGroupRequest): Promise<UserGroup> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Check if user has permission to update this group
    const { data: group } = await supabase
      .from('user_groups')
      .select('owner_id')
      .eq('id', groupId)
      .single();

    if (!group) {
      throw new Error('Group not found');
    }

    // Check if user is owner or admin
    const isOwner = group.owner_id === user.id;
    let isAdmin = false;

    if (!isOwner) {
      const { data: membership } = await supabase
        .from('user_group_members')
        .select('role')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .single();

      isAdmin = membership?.role === 'admin';
    }

    if (!isOwner && !isAdmin) {
      throw new Error('Insufficient permissions to update this group');
    }

    // Only owners can change visibility
    if (updateData.is_public !== undefined && !isOwner) {
      throw new Error('Only group owners can change group visibility');
    }

    const { data, error } = await supabase
      .from('user_groups')
      .update(updateData)
      .eq('id', groupId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Delete a group (owner only)
   */
  async deleteGroup(groupId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Check if user is the owner
    const { data: group } = await supabase
      .from('user_groups')
      .select('owner_id')
      .eq('id', groupId)
      .single();

    if (!group || group.owner_id !== user.id) {
      throw new Error('Only group owners can delete groups');
    }

    const { error } = await supabase
      .from('user_groups')
      .delete()
      .eq('id', groupId);

    if (error) throw error;
  }

  /**
   * Check if a group name is available for the current user
   */
  async isGroupNameAvailable(name: string, excludeGroupId?: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    let query = supabase
      .from('user_groups')
      .select('id')
      .eq('owner_id', user.id)
      .eq('name', name);

    if (excludeGroupId) {
      query = query.neq('id', excludeGroupId);
    }

    const { data, error } = await query;
    
    if (error) throw error;
    return data.length === 0;
  }

  /**
   * Check if a group is public
   */
  async isGroupPublic(groupId: string): Promise<boolean> {
    const { data: result, error } = await supabase
      .rpc('is_group_public', { group_uuid: groupId });

    if (error) throw error;

    return result || false;
  }
}

export const groupService = new GroupService(); 