import { supabase } from '../lib/supabase';
import type { UserGroup, GroupWithMembership, CreateGroupRequest, UpdateGroupRequest } from '../types/group';

export class GroupService {
  /**
   * Get all groups for the current user (including groups where they're members)
   */
  async getUserGroups(): Promise<GroupWithMembership[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // First, get groups the user owns
    const { data: ownedGroups, error: ownedError } = await supabase
      .from('user_groups')
      .select('*')
      .eq('owner_id', user.id);

    if (ownedError) throw ownedError;

    // Then, get groups the user is a member of
    const { data: memberships, error: membershipError } = await supabase
      .from('user_group_members')
      .select('*')
      .eq('user_id', user.id);

    if (membershipError) throw membershipError;

    // Get groups where user is a member (not owner)
    const memberGroupIds = memberships
      .map(m => m.group_id)
      .filter(groupId => !ownedGroups.some(og => og.id === groupId));

    let memberGroups: any[] = [];
    if (memberGroupIds.length > 0) {
      const { data, error } = await supabase
        .from('user_groups')
        .select('*')
        .in('id', memberGroupIds);

      if (error) throw error;
      memberGroups = data || [];
    }

    // Combine owned and member groups
    const allGroups = [...ownedGroups, ...memberGroups];

    // Transform the data and add computed fields
    const groupsWithMembership: GroupWithMembership[] = await Promise.all(
      allGroups.map(async (group: any) => {
        // Find user's role in this group
        const membership = memberships.find(m => m.group_id === group.id);
        const role = group.owner_id === user.id ? 'owner' : (membership?.role || 'member');

        // Get member count
        const { count: memberCount } = await supabase
          .from('user_group_members')
          .select('*', { count: 'exact' })
          .eq('group_id', group.id);

        // Get integration count (feeds associated with this group)
        const { count: integrationCount } = await supabase
          .from('feeds')
          .select('*', { count: 'exact' })
          .eq('group_id', group.id);

        return {
          id: group.id,
          name: group.name,
          description: group.description,
          owner_id: group.owner_id,
          created_at: group.created_at,
          updated_at: group.updated_at,
          role: role,
          member_count: memberCount || 0,
          integration_count: integrationCount || 0
        };
      })
    );

    return groupsWithMembership;
  }

  /**
   * Get a specific group by ID (if user has access)
   */
  async getGroup(groupId: string): Promise<GroupWithMembership | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get the group
    const { data: group, error: groupError } = await supabase
      .from('user_groups')
      .select('*')
      .eq('id', groupId)
      .single();

    if (groupError) {
      if (groupError.code === 'PGRST116') return null; // No rows returned
      throw groupError;
    }

    // Check if user has access (owner or member)
    const isOwner = group.owner_id === user.id;
    let membership = null;

    if (!isOwner) {
      const { data: membershipData, error: membershipError } = await supabase
        .from('user_group_members')
        .select('*')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .single();

      if (membershipError && membershipError.code !== 'PGRST116') {
        throw membershipError;
      }

      membership = membershipData;
      
      // If user is not owner and not a member, they don't have access
      if (!membership) {
        return null;
      }
    }

    // Get additional counts
    const [memberCountResult, integrationCountResult] = await Promise.all([
      supabase.from('user_group_members').select('*', { count: 'exact' }).eq('group_id', groupId),
      supabase.from('feeds').select('*', { count: 'exact' }).eq('group_id', groupId)
    ]);

    const role = isOwner ? 'owner' : (membership?.role || 'member');

    return {
      id: group.id,
      name: group.name,
      description: group.description,
      owner_id: group.owner_id,
      created_at: group.created_at,
      updated_at: group.updated_at,
      role: role,
      member_count: memberCountResult.count || 0,
      integration_count: integrationCountResult.count || 0
    };
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
        owner_id: user.id
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
}

export const groupService = new GroupService(); 