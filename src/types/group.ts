export interface UserGroup {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  is_public: boolean;
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
  is_owner: boolean;
  can_access: boolean;
}

export interface PublicGroup extends Omit<UserGroup, 'owner_id'> {
  is_public: true;
  member_count: number;
  feed_count: number;
  total_feed_items: number;
  last_activity: string;
  user_role: 'none' | 'viewer' | 'member' | 'admin' | 'owner';
  can_join: boolean;
}

export interface PrivateGroup extends UserGroup {
  is_public: false;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  member_count: number;
  integration_count: number;
}

export interface AccessibleGroupsResponse {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  is_public: boolean;
  user_role: string;
  member_count: number;
  is_owner: boolean;
}

export interface PublicGroupStatsResponse {
  id: string;
  name: string;
  description?: string;
  member_count: number;
  feed_count: number;
  total_feed_items: number;
  last_activity: string;
  created_at: string;
}

export interface PublicGroupFeedsResponse {
  id: string;
  url: string;
  title: string;
  description?: string;
  integration_name: string;
  integration_alias?: string;
  last_fetched: string;
  recent_items_count: number;
}

export interface JoinGroupResponse {
  success: boolean;
  message: string;
  role?: string;
}

export interface ToggleVisibilityResponse {
  success: boolean;
  message: string;
  is_public?: boolean;
}

export interface CreateGroupRequest {
  name: string;
  description?: string;
  is_public?: boolean;
}

export interface UpdateGroupRequest {
  name?: string;
  description?: string;
  is_public?: boolean;
}

export interface GroupContextType {
  currentGroup: GroupWithMembership | null;
  currentPublicGroup: PublicGroup | null;
  userGroups: GroupWithMembership[];
  isLoading: boolean;
  switchToGroup: (groupId: string | null) => Promise<void>;
  createGroup: (data: CreateGroupRequest) => Promise<UserGroup>;
  updateGroup: (groupId: string, data: UpdateGroupRequest) => Promise<UserGroup>;
  deleteGroup: (groupId: string) => Promise<void>;
  refreshGroups: () => Promise<void>;
  syncWithUrl: (urlGroupId: string) => void;
  getPublicGroup: (groupId: string) => Promise<PublicGroup | null>;
  joinPublicGroup: (groupId: string) => Promise<JoinGroupResponse>;
  toggleGroupVisibility: (groupId: string, isPublic: boolean) => Promise<ToggleVisibilityResponse>;
}

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
  canToggleVisibility: boolean;
} 