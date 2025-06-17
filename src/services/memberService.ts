import { supabase } from '../lib/supabase';
import { emailService } from './emailService';
import type { 
  GroupMember, 
  GroupInvitation,
  InviteMemberRequest,
  UpdateMemberRoleRequest,
  AcceptInvitationRequest
} from '../types/group';

export class MemberService {
  /**
   * Check if user is owner of a group
   */
  private async isGroupOwner(groupId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('is_group_owner', { group_uuid: groupId });
    if (error) {
      console.error('Error checking group ownership:', error);
      return false;
    }
    return data === true;
  }

  /**
   * Check if user is admin or owner of a group
   */
  private async isGroupAdminOrOwner(groupId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('is_group_admin_or_owner', { group_uuid: groupId });
    if (error) {
      console.error('Error checking group admin/owner status:', error);
      return false;
    }
    return data === true;
  }

  /**
   * Get all members of a group using RPC function
   */
  async getGroupMembers(groupId: string): Promise<GroupMember[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Use RPC function to get members with profile data
    const { data: members, error } = await supabase
      .rpc('get_group_members_with_profiles', { group_uuid: groupId });

    if (error) {
      console.error('Error fetching group members:', error);
      throw new Error(`Error al cargar los miembros del grupo: ${error.message}`);
    }

    if (!members) return [];

    // Transform the data to match GroupMember interface
    return members.map((member: any) => ({
      id: member.id,
      email: member.email,
      name: member.name || member.full_name,
      role: member.role,
      joined_at: member.joined_at,
      user_id: member.user_id,
      group_id: groupId,
      last_active: member.last_sign_in_at,
    }));
  }

  /**
   * Invite a member to a group
   */
  async inviteMember(groupId: string, inviteData: InviteMemberRequest): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Check if user has permission to invite members using helper function
    const canInvite = await this.isGroupAdminOrOwner(groupId);
    if (!canInvite) {
      throw new Error('Permission denied: Cannot invite members');
    }

    // Get group info
    const { data: group } = await supabase
      .from('user_groups')
      .select('name')
      .eq('id', groupId)
      .maybeSingle();

    if (!group) throw new Error('Group not found');

    // Check if invitation already exists
    const { data: existingInvite } = await supabase
      .from('group_invitations')
      .select('id')
      .eq('group_id', groupId)
      .eq('invited_email', inviteData.email)
      .is('accepted_at', null)
      .maybeSingle();

    if (existingInvite) {
      throw new Error('An invitation to this email already exists');
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    const { error: inviteError } = await supabase
      .from('group_invitations')
      .insert({
        group_id: groupId,
        invited_email: inviteData.email,
        invited_by: user.id,
        role: inviteData.role,
        token: token,
        expires_at: expiresAt.toISOString(),
      });

    if (inviteError) throw inviteError;

    // Send invitation email
    try {
      const inviterName = user.user_metadata?.name || 
                         user.user_metadata?.full_name || 
                         user.email || 
                         'Someone';

      await emailService.sendInvitationEmail({
        email: inviteData.email,
        groupName: group.name,
        inviterName,
        role: inviteData.role,
        token: token,
      });

      console.log(`✅ Invitation email sent to ${inviteData.email}`);
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError);
    }

    console.log(`Invitation sent to ${inviteData.email} with token: ${token}`);
  }

  /**
   * Get pending invitations for a group using RPC function
   */
  async getGroupInvitations(groupId: string): Promise<GroupInvitation[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Use RPC function to get invitations with inviter profile data
    const { data: invitations, error } = await supabase
      .rpc('get_group_invitations_with_profiles', { group_uuid: groupId });

    if (error) {
      console.error('Error fetching group invitations:', error);
      throw new Error(`Error al cargar las invitaciones del grupo: ${error.message}`);
    }

    if (!invitations) return [];

    // Get group name for invitations
    const { data: group } = await supabase
      .from('user_groups')
      .select('name')
      .eq('id', groupId)
      .maybeSingle();

    // Transform the data to match GroupInvitation interface
    return invitations.map((invitation: any) => ({
      id: invitation.id,
      group_id: invitation.group_id,
      group_name: group?.name || 'Unknown Group',
      invited_email: invitation.invited_email,
      invited_by: invitation.invited_by,
      invited_by_name: invitation.invited_by_name,
      role: invitation.role,
      token: invitation.token,
      expires_at: invitation.expires_at,
      created_at: invitation.created_at,
      accepted_at: invitation.accepted_at,
      is_expired: invitation.is_expired,
    }));
  }

  /**
   * Update a member's role
   */
  async updateMemberRole(groupId: string, updateData: UpdateMemberRoleRequest): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Check permissions using helper function
    const canManage = await this.isGroupAdminOrOwner(groupId);
    if (!canManage) {
      throw new Error('Permission denied: Cannot manage members');
    }

    // Check if trying to update owner role
    const isOwner = await this.isGroupOwner(groupId);
    if (!isOwner) {
      // Non-owners cannot update admin roles
      const { data: targetMember } = await supabase
        .from('user_group_members')
        .select('role')
        .eq('group_id', groupId)
        .eq('user_id', updateData.user_id)
        .maybeSingle();

      if (targetMember?.role === 'admin' || updateData.role === 'admin') {
        throw new Error('Only group owners can manage admin roles');
      }
    }

    const { error } = await supabase
      .from('user_group_members')
      .update({ role: updateData.role })
      .eq('group_id', groupId)
      .eq('user_id', updateData.user_id);

    if (error) throw error;
  }

  /**
   * Remove a member from a group
   */
  async removeMember(groupId: string, userId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Check permissions using helper function
    const canRemove = await this.isGroupAdminOrOwner(groupId);
    if (!canRemove) {
      throw new Error('Permission denied: Cannot remove members');
    }

    // Check if trying to remove owner
    const { data: group } = await supabase
      .from('user_groups')
      .select('owner_id')
      .eq('id', groupId)
      .maybeSingle();

    if (group?.owner_id === userId) {
      throw new Error('Cannot remove group owner');
    }

    // Non-owners cannot remove admins
    const isOwner = await this.isGroupOwner(groupId);
    if (!isOwner) {
      const { data: targetMember } = await supabase
        .from('user_group_members')
        .select('role')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .maybeSingle();

      if (targetMember?.role === 'admin') {
        throw new Error('Only group owners can remove admins');
      }
    }

    const { error } = await supabase
      .from('user_group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);

    if (error) throw error;
  }

  /**
   * Check if an email is already registered
   */
  async checkEmailExists(email: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('check_email_exists', {
        check_email: email
      });
      
      if (error) {
        console.error('Error checking email existence:', error);
        return false;
      }
      
      return data === true;
    } catch (error) {
      console.error('Error checking email existence:', error);
      return false;
    }
  }

  /**
   * Accept an invitation (for new users)
   */
  async acceptInvitation(acceptData: AcceptInvitationRequest): Promise<void> {
    // Sign up the user with email confirmation
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: acceptData.email,
      password: acceptData.password,
      options: {
        data: {
          name: acceptData.name,
          full_name: acceptData.name,
        },
        // Set redirect URL to handle invitation after email confirmation
        emailRedirectTo: `${window.location.origin}/confirm-email?invitation=${acceptData.token}&email=${encodeURIComponent(acceptData.email)}`
      }
    });

    if (signUpError) {
      console.error('Signup error:', signUpError);
      if (signUpError.message.includes('User already registered')) {
        throw new Error('Este email ya está registrado. Por favor inicia sesión en su lugar.');
      }
      throw new Error(`Error al crear la cuenta: ${signUpError.message}`);
    }

    if (!authData.user) {
      throw new Error('Failed to create user account');
    }

    // If the user was created but needs email confirmation
    if (!authData.session) {
      // Don't try to accept invitation yet - wait for email confirmation
      console.log('✅ Account created, waiting for email confirmation');
      return;
    }

    // If user was created and confirmed immediately (in development)
    // Use the database function to accept the invitation atomically
    try {
      const { data: result, error: acceptError } = await supabase.rpc('accept_group_invitation', {
        invitation_token: acceptData.token,
        user_email: acceptData.email
      });

      if (acceptError) {
        console.error('Invitation acceptance error:', acceptError);
        throw new Error(`Error al aceptar la invitación: ${acceptError.message}`);
      }

      if (!result?.success) {
        throw new Error(result?.error || 'Error desconocido al aceptar la invitación');
      }

      console.log('✅ Invitation accepted successfully:', result);
    } catch (error) {
      console.error('Failed to accept invitation:', error);
      throw error;
    }
  }

  /**
   * Cancel/revoke an invitation
   */
  async cancelInvitation(invitationId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get invitation to check permissions
    const { data: invitation } = await supabase
      .from('group_invitations')
      .select('group_id, invited_by')
      .eq('id', invitationId)
      .maybeSingle();

    if (!invitation) throw new Error('Invitation not found');

    // Check if user can cancel this invitation
    const canCancel = invitation.invited_by === user.id;

    if (!canCancel) {
      // Check if user is owner/admin of the group
      const { data: membership } = await supabase
        .from('user_group_members')
        .select('role')
        .eq('group_id', invitation.group_id)
        .eq('user_id', user.id)
        .maybeSingle();

      const { data: group } = await supabase
        .from('user_groups')
        .select('owner_id')
        .eq('id', invitation.group_id)
        .maybeSingle();

      const isOwner = group?.owner_id === user.id;
      const isAdmin = membership?.role === 'admin';

      if (!isOwner && !isAdmin) {
        throw new Error('Permission denied');
      }
    }

    const { error } = await supabase
      .from('group_invitations')
      .delete()
      .eq('id', invitationId);

    if (error) throw error;
  }

  /**
   * Get invitation by token (for invitation validation)
   * Works for both authenticated and anonymous users
   */
  async getInvitationByToken(token: string): Promise<GroupInvitation | null> {
    // Query invitation directly (now allowed by RLS policy for anonymous users)
    const { data: invitation, error } = await supabase
      .from('group_invitations')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (error) {
      console.error('Error fetching invitation by token:', error);
      return null;
    }
    
    if (!invitation) {
      console.log('No invitation found for token:', token);
      return null;
    }

    // Get group details (now allowed by RLS policy for anonymous users)
    const { data: group } = await supabase
      .from('user_groups')
      .select('name')
      .eq('id', invitation.group_id)
      .maybeSingle();

    // Don't try to get inviter details for anonymous users to avoid auth.admin errors
    const inviterName = 'Un miembro del equipo';

    return {
      id: invitation.id,
      group_id: invitation.group_id,
      group_name: group?.name || 'Unknown Group',
      invited_email: invitation.invited_email,
      invited_by: invitation.invited_by,
      invited_by_name: inviterName,
      role: invitation.role,
      token: invitation.token,
      expires_at: invitation.expires_at,
      created_at: invitation.created_at,
      accepted_at: invitation.accepted_at,
      is_expired: new Date(invitation.expires_at) < new Date(),
    };
  }

  /**
   * Accept invitation for existing user (login flow)
   */
  async acceptInvitationExistingUser(token: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !user.email) throw new Error('User must be logged in');

    // Use the database function to accept the invitation atomically
    try {
      const { data: result, error: acceptError } = await supabase.rpc('accept_group_invitation', {
        invitation_token: token,
        user_email: user.email
      });

      if (acceptError) {
        console.error('Invitation acceptance error:', acceptError);
        throw new Error(`Error al aceptar la invitación: ${acceptError.message}`);
      }

      if (!result?.success) {
        throw new Error(result?.error || 'Error desconocido al aceptar la invitación');
      }

      console.log('✅ Invitation accepted successfully for existing user:', result);
    } catch (error) {
      console.error('Failed to accept invitation for existing user:', error);
      throw error;
    }
  }
}

export const memberService = new MemberService(); 