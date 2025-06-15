import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { memberService } from '../../services/memberService';
import { InviteMemberModal } from './InviteMemberModal';
import { 
  getGroupPermissions, 
  getRoleDisplayName, 
  getRoleBadgeColor,
  canManageRole,
  getAssignableRoles 
} from '../../utils/permissions';
import type { GroupMember, GroupRole, UpdateMemberRoleRequest } from '../../types/group';

interface MemberManagementProps {
  groupId: string;
  userRole: GroupRole;
}

interface ConfirmRemovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: GroupMember | null;
  onConfirm: () => void;
  isLoading: boolean;
}

function ConfirmRemovalModal({ isOpen, onClose, member, onConfirm, isLoading }: ConfirmRemovalModalProps) {
  if (!isOpen || !member) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900">Remove Member</h3>
          </div>
          
          <p className="text-gray-600 mb-6">
            Are you sure you want to remove <strong>{member.name || member.email}</strong> from this group? 
            They will lose access to all group integrations and content.
          </p>
          
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Removing...
                </>
              ) : (
                'Remove Member'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MemberManagement({ groupId, userRole }: MemberManagementProps) {
  const queryClient = useQueryClient();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showRemovalModal, setShowRemovalModal] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<GroupMember | null>(null);

  const permissions = getGroupPermissions(userRole);

  // Fetch group members
  const { data: members = [], isLoading, error } = useQuery({
    queryKey: ['group-members', groupId],
    queryFn: () => memberService.getGroupMembers(groupId),
    enabled: !!groupId,
  });

  // Fetch pending invitations
  const { data: invitations = [] } = useQuery({
    queryKey: ['group-invitations', groupId],
    queryFn: () => memberService.getGroupInvitations(groupId),
    enabled: !!groupId && permissions.canManageMembers,
  });

  // Update member role mutation
  const updateRoleMutation = useMutation({
    mutationFn: (data: UpdateMemberRoleRequest) => 
      memberService.updateMemberRole(groupId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-members', groupId] });
    },
    onError: (error) => {
      console.error('Failed to update member role:', error);
      alert('Failed to update member role. Please try again.');
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => memberService.removeMember(groupId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-members', groupId] });
      setShowRemovalModal(false);
      setMemberToRemove(null);
    },
    onError: (error) => {
      console.error('Failed to remove member:', error);
      alert('Failed to remove member. Please try again.');
    },
  });

  // Cancel invitation mutation
  const cancelInvitationMutation = useMutation({
    mutationFn: (invitationId: string) => memberService.cancelInvitation(invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-invitations', groupId] });
    },
    onError: (error) => {
      console.error('Failed to cancel invitation:', error);
      alert('Failed to cancel invitation. Please try again.');
    },
  });

  const handleRoleChange = (member: GroupMember, newRole: GroupRole) => {
    if (newRole === member.role) return;
    
    updateRoleMutation.mutate({
      user_id: member.user_id,
      role: newRole as 'admin' | 'member' | 'viewer',
    });
  };

  const handleRemoveMember = (member: GroupMember) => {
    setMemberToRemove(member);
    setShowRemovalModal(true);
  };

  const confirmRemoveMember = () => {
    if (memberToRemove) {
      removeMemberMutation.mutate(memberToRemove.user_id);
    }
  };

  const handleInviteSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['group-invitations', groupId] });
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center space-x-4">
                <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-red-700">Failed to load group members</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Members</h2>
          <p className="text-sm text-gray-600">
            {members.length} {members.length === 1 ? 'member' : 'members'}
            {invitations.length > 0 && ` • ${invitations.length} pending invitation${invitations.length === 1 ? '' : 's'}`}
          </p>
        </div>
        
        {permissions.canInviteMembers && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Invite Members
          </button>
        )}
      </div>

      {/* Members List */}
      <div className="space-y-4">
        {members.map((member) => (
          <div key={member.id} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-semibold text-blue-700">
                    {(member.name || member.email).charAt(0).toUpperCase()}
                  </span>
                </div>
                
                <div>
                  <div className="font-medium text-gray-900">
                    {member.name || 'Unnamed User'}
                  </div>
                  <div className="text-sm text-gray-600">{member.email}</div>
                  <div className="text-xs text-gray-500">
                    Joined {new Date(member.joined_at).toLocaleDateString()}
                    {member.last_active && (
                      <> • Last active {new Date(member.last_active).toLocaleDateString()}</>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {/* Role Badge/Selector */}
                {permissions.canManageMembers && canManageRole(userRole, member.role) ? (
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleChange(member, e.target.value as GroupRole)}
                    className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={updateRoleMutation.isPending}
                  >
                    {getAssignableRoles(userRole).map((role) => (
                      <option key={role} value={role}>
                        {getRoleDisplayName(role)}
                      </option>
                    ))}
                    {/* Keep current role even if it's not assignable anymore */}
                    {!getAssignableRoles(userRole).includes(member.role) && (
                      <option value={member.role}>
                        {getRoleDisplayName(member.role)}
                      </option>
                    )}
                  </select>
                ) : (
                  <span className={`px-2 py-1 text-xs font-medium rounded ${getRoleBadgeColor(member.role)}`}>
                    {getRoleDisplayName(member.role)}
                  </span>
                )}

                {/* Remove Member Button */}
                {permissions.canRemoveMembers && canManageRole(userRole, member.role) && (
                  <button
                    onClick={() => handleRemoveMember(member)}
                    className="text-red-600 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                    title="Remove member"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pending Invitations */}
      {permissions.canManageMembers && invitations.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Pending Invitations</h3>
          <div className="space-y-3">
            {invitations.map((invitation) => (
              <div key={invitation.id} className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <svg className="h-5 w-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <div className="font-medium text-gray-900">{invitation.invited_email}</div>
                      <div className="text-sm text-gray-600">
                        Invited by {invitation.invited_by_name} • {getRoleDisplayName(invitation.role)} role
                      </div>
                      <div className="text-xs text-gray-500">
                        {invitation.is_expired ? (
                          <span className="text-red-600">Expired {new Date(invitation.expires_at).toLocaleDateString()}</span>
                        ) : (
                          <>Expires {new Date(invitation.expires_at).toLocaleDateString()}</>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => cancelInvitationMutation.mutate(invitation.id)}
                    disabled={cancelInvitationMutation.isPending}
                    className="text-red-600 hover:text-red-700 text-sm px-3 py-1 border border-red-300 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {members.length === 0 && (
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM9 9a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No members yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Start collaborating by inviting team members to this group.
          </p>
          {permissions.canInviteMembers && (
            <div className="mt-6">
              <button
                onClick={() => setShowInviteModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Invite your first member
              </button>
            </div>
          )}
        </div>
      )}

      {/* Invite Member Modal */}
      {showInviteModal && (
        <InviteMemberModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          groupId={groupId}
          userRole={userRole}
          onInviteSuccess={handleInviteSuccess}
        />
      )}

      {/* Confirm Removal Modal */}
      <ConfirmRemovalModal
        isOpen={showRemovalModal}
        onClose={() => setShowRemovalModal(false)}
        member={memberToRemove}
        onConfirm={confirmRemoveMember}
        isLoading={removeMemberMutation.isPending}
      />
    </div>
  );
} 