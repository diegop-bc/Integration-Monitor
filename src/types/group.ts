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
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
}

export interface GroupWithMembership extends UserGroup {
  role: 'owner' | 'admin' | 'member';
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