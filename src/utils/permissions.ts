import type { GroupRole, GroupPermissions } from '../types/group';

/**
 * Get user permissions based on their role in a group
 */
export function getGroupPermissions(userRole: GroupRole): GroupPermissions {
  switch (userRole) {
    case 'owner':
      return {
        canManageMembers: true,
        canInviteMembers: true,
        canManageIntegrations: true,
        canEditGroup: true,
        canDeleteGroup: true,
        canRemoveMembers: true,
      };
    
    case 'admin':
      return {
        canManageMembers: true,
        canInviteMembers: true,
        canManageIntegrations: true,
        canEditGroup: true,
        canDeleteGroup: false,
        canRemoveMembers: true,
      };
    
    case 'member':
      return {
        canManageMembers: false,
        canInviteMembers: false,
        canManageIntegrations: true,
        canEditGroup: false,
        canDeleteGroup: false,
        canRemoveMembers: false,
      };
    
    case 'viewer':
      return {
        canManageMembers: false,
        canInviteMembers: false,
        canManageIntegrations: false,
        canEditGroup: false,
        canDeleteGroup: false,
        canRemoveMembers: false,
      };
    
    default:
      // Default to most restrictive permissions
      return {
        canManageMembers: false,
        canInviteMembers: false,
        canManageIntegrations: false,
        canEditGroup: false,
        canDeleteGroup: false,
        canRemoveMembers: false,
      };
  }
}

/**
 * Check if a user can perform a specific action
 */
export function canUserPerformAction(
  userRole: GroupRole,
  action: keyof GroupPermissions
): boolean {
  const permissions = getGroupPermissions(userRole);
  return permissions[action];
}

/**
 * Get a human-readable role name
 */
export function getRoleDisplayName(role: GroupRole): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'admin':
      return 'Admin';
    case 'member':
      return 'Member';
    case 'viewer':
      return 'Viewer';
    default:
      return 'Unknown';
  }
}

/**
 * Get role badge color for UI styling
 */
export function getRoleBadgeColor(role: GroupRole): string {
  switch (role) {
    case 'owner':
      return 'bg-purple-100 text-purple-800';
    case 'admin':
      return 'bg-blue-100 text-blue-800';
    case 'member':
      return 'bg-green-100 text-green-800';
    case 'viewer':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Check if a role can manage another role
 */
export function canManageRole(managerRole: GroupRole, targetRole: GroupRole): boolean {
  // Owners can manage anyone except other owners
  if (managerRole === 'owner') {
    return targetRole !== 'owner';
  }

  // Admins can manage members and viewers
  if (managerRole === 'admin') {
    return targetRole === 'member' || targetRole === 'viewer';
  }

  // Members and viewers cannot manage others
  return false;
}

/**
 * Get available roles for assignment by a user
 */
export function getAssignableRoles(managerRole: GroupRole): GroupRole[] {
  switch (managerRole) {
    case 'owner':
      return ['admin', 'member', 'viewer'];
    case 'admin':
      return ['member', 'viewer'];
    default:
      return [];
  }
} 