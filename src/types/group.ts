export interface UserGroup {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface GroupMembership {
  group_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joined_at: string;
}

export interface GroupWithMembership extends UserGroup {
  role: 'owner' | 'admin' | 'member' | 'viewer';
  member_count: number;
  integration_count: number;
}

export interface CreateGroupRequest {
  name: string;
  description?: string;
}

export interface UpdateGroupRequest {
  name?: string;
  description?: string;
}

export interface GroupContextType {
  currentGroup: GroupWithMembership | null;
  userGroups: GroupWithMembership[];
  isLoading: boolean;
  switchToGroup: (groupId: string | null) => Promise<void>;
  createGroup: (data: CreateGroupRequest) => Promise<UserGroup>;
  updateGroup: (groupId: string, data: UpdateGroupRequest) => Promise<UserGroup>;
  deleteGroup: (groupId: string) => Promise<void>;
  refreshGroups: () => Promise<void>;
  syncWithUrl: (urlGroupId: string) => void;
}

// New types for Phase 3: Member Management & Invitations

export interface GroupMember {
  id: string;
  email: string;
  name?: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joined_at: string;
  user_id: string;
  group_id: string;
  last_active?: string;
}

export interface InviteMemberRequest {
  email: string;
  role: 'admin' | 'member' | 'viewer';
}

export interface GroupInvitation {
  id: string;
  group_id: string;
  group_name: string;
  invited_email: string;
  invited_by: string;
  invited_by_name?: string;
  role: 'admin' | 'member' | 'viewer';
  token: string;
  expires_at: string;
  created_at: string;
  accepted_at?: string;
  is_expired: boolean;
}

export interface UpdateMemberRoleRequest {
  user_id: string;
  role: 'admin' | 'member' | 'viewer';
}

export interface AcceptInvitationRequest {
  token: string;
  email: string;
  password: string;
  name?: string;
}

export type GroupRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface GroupPermissions {
  canManageMembers: boolean;
  canInviteMembers: boolean;
  canManageIntegrations: boolean;
  canEditGroup: boolean;
  canDeleteGroup: boolean;
  canRemoveMembers: boolean;
} 