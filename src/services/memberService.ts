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
   * Get all members of a group
   */
  async getGroupMembers(groupId: string): Promise<GroupMember[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // First check if user has access to this group
    const { data: groupAccess } = await supabase
      .from('user_group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();

    if (!groupAccess) {
      // Check if user is owner
      const { data: group } = await supabase
        .from('user_groups')
        .select('owner_id')
        .eq('id', groupId)
        .single();

      if (!group || group.owner_id !== user.id) {
        throw new Error('Access denied');
      }
    }

    // Get all group members
    const { data: members, error } = await supabase
      .from('user_group_members')
      .select('*')
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true });

    if (error) throw error;
    if (!members) return [];

    // Get user details for each member
    const memberDetails = await Promise.all(
      members.map(async (member) => {
        const { data: userProfile } = await supabase.auth.admin.getUserById(member.user_id);
        
        return {
          id: member.user_id,
          email: userProfile.user?.email || 'Unknown',
          name: userProfile.user?.user_metadata?.name || userProfile.user?.user_metadata?.full_name,
          role: member.role,
          joined_at: member.joined_at,
          user_id: member.user_id,
          group_id: member.group_id,
          last_active: userProfile.user?.last_sign_in_at,
        };
      })
    );

    return memberDetails;
  }

  /**
   * Invite a member to a group
   */
  async inviteMember(groupId: string, inviteData: InviteMemberRequest): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Check if user has permission to invite members
    const { data: membership } = await supabase
      .from('user_group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();

    const { data: group } = await supabase
      .from('user_groups')
      .select('owner_id, name')
      .eq('id', groupId)
      .single();

    if (!group) throw new Error('Group not found');

    const isOwner = group.owner_id === user.id;
    const canInvite = isOwner || (membership && ['admin'].includes(membership.role));

    if (!canInvite) {
      throw new Error('Permission denied: Cannot invite members');
    }

    // Check if user already exists by trying to get users (simplified approach)
    // For MVP, we'll create invitation first and handle existing users during acceptance
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    // Check if invitation already exists
    const { data: existingInvite } = await supabase
      .from('group_invitations')
      .select('id')
      .eq('group_id', groupId)
      .eq('invited_email', inviteData.email)
      .is('accepted_at', null)
      .single();

    if (existingInvite) {
      throw new Error('An invitation to this email already exists');
    }

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
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const inviterName = currentUser?.user_metadata?.name || 
                         currentUser?.user_metadata?.full_name || 
                         currentUser?.email || 
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
      // Don't throw error here - invitation was created successfully
      // The user can still use the invitation link manually
    }

    // TODO: Send invitation email with signup link
    console.log(`Invitation sent to ${inviteData.email} with token: ${token}`);
  }

  /**
   * Get pending invitations for a group
   */
  async getGroupInvitations(groupId: string): Promise<GroupInvitation[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Check access permissions
    const { data: membership } = await supabase
      .from('user_group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();

    const { data: group } = await supabase
      .from('user_groups')
      .select('owner_id, name')
      .eq('id', groupId)
      .single();

    if (!group) throw new Error('Group not found');

    const isOwner = group.owner_id === user.id;
    const canView = isOwner || (membership && ['admin'].includes(membership.role));

    if (!canView) {
      throw new Error('Permission denied');
    }

    const { data: invitations, error } = await supabase
      .from('group_invitations')
      .select('*')
      .eq('group_id', groupId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!invitations) return [];

    // Get inviter details for each invitation
    const invitationDetails = await Promise.all(
      invitations.map(async (inv) => {
        const { data: inviterProfile } = await supabase.auth.admin.getUserById(inv.invited_by);
        
        return {
          id: inv.id,
          group_id: inv.group_id,
          group_name: group.name,
          invited_email: inv.invited_email,
          invited_by: inv.invited_by,
          invited_by_name: inviterProfile.user?.user_metadata?.name || inviterProfile.user?.user_metadata?.full_name || inviterProfile.user?.email,
          role: inv.role,
          token: inv.token,
          expires_at: inv.expires_at,
          created_at: inv.created_at,
          accepted_at: inv.accepted_at,
          is_expired: new Date(inv.expires_at) < new Date(),
        };
      })
    );

    return invitationDetails;
  }

  /**
   * Update a member's role
   */
  async updateMemberRole(groupId: string, updateData: UpdateMemberRoleRequest): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Check permissions
    const { data: membership } = await supabase
      .from('user_group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();

    const { data: group } = await supabase
      .from('user_groups')
      .select('owner_id')
      .eq('id', groupId)
      .single();

    if (!group) throw new Error('Group not found');

    const isOwner = group.owner_id === user.id;
    const canManage = isOwner || (membership && ['admin'].includes(membership.role));

    if (!canManage) {
      throw new Error('Permission denied: Cannot manage members');
    }

    // Cannot update owner role
    if (updateData.user_id === group.owner_id) {
      throw new Error('Cannot change owner role');
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

    // Check permissions
    const { data: membership } = await supabase
      .from('user_group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();

    const { data: group } = await supabase
      .from('user_groups')
      .select('owner_id')
      .eq('id', groupId)
      .single();

    if (!group) throw new Error('Group not found');

    const isOwner = group.owner_id === user.id;
    const canRemove = isOwner || (membership && ['admin'].includes(membership.role));

    if (!canRemove) {
      throw new Error('Permission denied: Cannot remove members');
    }

    // Cannot remove owner
    if (userId === group.owner_id) {
      throw new Error('Cannot remove group owner');
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
      .single();

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
        .single();

      const { data: group } = await supabase
        .from('user_groups')
        .select('owner_id')
        .eq('id', invitation.group_id)
        .single();

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
      .single();

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
      .single();

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