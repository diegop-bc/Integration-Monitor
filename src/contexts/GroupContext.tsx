import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { groupService } from '../services/groupService';
import type { GroupContextType, GroupWithMembership, CreateGroupRequest, UpdateGroupRequest, PublicGroup } from '../types/group';
import { useAuth } from './AuthContext';

const GroupContext = createContext<GroupContextType | undefined>(undefined);

export const useGroup = () => {
  const context = useContext(GroupContext);
  if (context === undefined) {
    throw new Error('useGroup must be used within a GroupProvider');
  }
  return context;
};

interface GroupProviderProps {
  children: React.ReactNode;
}

const STORAGE_KEY = 'integration-monitor-current-group';

export const GroupProvider: React.FC<GroupProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();
  const [currentGroup, setCurrentGroup] = useState<GroupWithMembership | null>(null);
  const [currentPublicGroup, setCurrentPublicGroup] = useState<PublicGroup | null>(null);
  const [userGroups, setUserGroups] = useState<GroupWithMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingPublicGroup, setIsCheckingPublicGroup] = useState(false);

  // Memoize the current group ID from URL to prevent unnecessary effects
  const groupIdFromUrl = useMemo(() => {
    return params.groupId;
  }, [params.groupId]);

  // Memoized function to prevent unnecessary re-creations
  const checkPublicGroup = useCallback(async (groupId: string) => {
    try {
      console.log('🔍 Checking if group is public:', groupId);
      setIsCheckingPublicGroup(true);
      const publicGroup = await groupService.getPublicGroup(groupId);
      
      if (publicGroup) {
        console.log('✅ Found public group:', {
          groupName: publicGroup.name,
          groupId: publicGroup.id,
          canJoin: publicGroup.can_join,
          userRole: publicGroup.user_role
        });
        setCurrentPublicGroup(publicGroup);
        setCurrentGroup(null); // Clear any private group
        localStorage.removeItem(STORAGE_KEY); // Don't save public groups to localStorage
      } else {
        console.log('❌ Group not found or not public, redirecting to personal:', {
          requestedGroupId: groupId,
          availableGroups: userGroups.map(g => ({ id: g.id, name: g.name }))
        });
        // Group not found or not public, redirect to personal
        navigate('/personal', { replace: true });
      }
    } catch (error) {
      console.error('❌ Error checking public group:', error);
      // On error, redirect to personal
      navigate('/personal', { replace: true });
    } finally {
      setIsCheckingPublicGroup(false);
    }
  }, [navigate, userGroups]);

  // Load user's groups when authenticated - FIXED: Remove currentGroup dependency to prevent infinite loop
  useEffect(() => {
    if (user) {
      console.log('👤 User authenticated, loading groups...');
      const loadGroups = async () => {
        setIsLoading(true);
        
        try {
          const groups = await groupService.getUserGroups();
          console.log('✅ Groups loaded:', groups.length, 'groups');
          setUserGroups(groups);
        } catch (error) {
          console.error('❌ Failed to load groups:', error);
        } finally {
          setIsLoading(false);
        }
      };
      
      loadGroups();
    } else {
      console.log('🚪 User logged out, clearing groups...');
      // Clear groups when user logs out
      setUserGroups([]);
      setCurrentGroup(null);
      setCurrentPublicGroup(null);
      setIsLoading(false);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user?.id]); // FIXED: Removed currentGroup and navigate dependencies

  // Separate effect to handle current group updates when userGroups change
  useEffect(() => {
    if (currentGroup && userGroups.length > 0) {
      const updatedCurrentGroup = userGroups.find(g => g.id === currentGroup.id);
      if (updatedCurrentGroup) {
        console.log('✅ Current group updated with fresh data');
        setCurrentGroup(updatedCurrentGroup);
      } else {
        console.log('❌ Current group no longer exists, switching to personal');
        setCurrentGroup(null);
        localStorage.removeItem(STORAGE_KEY);
        navigate('/personal', { replace: true });
      }
    }
  }, [userGroups, currentGroup?.id, navigate]); // Only depend on userGroups and currentGroup.id

  // Sync current group with URL parameters - optimized with fewer dependencies
  useEffect(() => {
    // Skip if still loading user groups or checking public group
    if (isLoading || isCheckingPublicGroup) {
      return;
    }

    if (userGroups.length > 0 || (!user && !isLoading)) {
      if (groupIdFromUrl) {
        // URL has a group ID, first check user's groups
        const urlGroup = userGroups.find(g => g.id === groupIdFromUrl);
        
        if (urlGroup && urlGroup.id !== currentGroup?.id) {
          console.log('✅ Found group in userGroups, setting as current:', urlGroup.name);
          setCurrentGroup(urlGroup);
          setCurrentPublicGroup(null); // Clear any public group
          localStorage.setItem(STORAGE_KEY, urlGroup.id);
        } else if (!urlGroup && !currentPublicGroup) {
          console.log('❓ Group not found in userGroups, checking if it\'s a public group');
          // Clear localStorage when navigating to a group not in userGroups (likely public)
          localStorage.removeItem(STORAGE_KEY);
          // Group not found in user's groups, check if it's a public group
          checkPublicGroup(groupIdFromUrl);
        }
      } else if (location.pathname.startsWith('/personal') || location.pathname === '/') {
        // URL indicates personal workspace
        if (currentGroup || currentPublicGroup) {
          console.log('🔄 Switching to personal workspace');
          setCurrentGroup(null);
          setCurrentPublicGroup(null);
          localStorage.removeItem(STORAGE_KEY);
        }
      } else if (!currentGroup && !currentPublicGroup && !groupIdFromUrl) {
        // No group in URL and no current group, try to restore from localStorage
        // BUT only if we're not navigating to a specific group URL
        const savedGroupId = localStorage.getItem(STORAGE_KEY);
        if (savedGroupId && !location.pathname.includes('/group/')) {
          const savedGroup = userGroups.find(g => g.id === savedGroupId);
          if (savedGroup) {
            console.log('🔄 Restoring group from localStorage:', savedGroup.name);
            // Only restore if we're not on a personal workspace path
            if (!location.pathname.startsWith('/personal') && location.pathname !== '/') {
              navigate(`/group/${savedGroupId}`, { replace: true });
            }
          } else {
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      }
    }
  }, [
    userGroups, 
    groupIdFromUrl, 
    currentGroup?.id, 
    currentPublicGroup?.id, 
    location.pathname, 
    isLoading, 
    isCheckingPublicGroup,
    user,
    navigate,
    checkPublicGroup
  ]);

  const switchToGroup = useCallback(async (groupId: string | null) => {    
    if (groupId === null) {
      console.log('🏠 Switching to Personal mode');
      // Switch to "Personal" mode
      setCurrentGroup(null);
      setCurrentPublicGroup(null);
      localStorage.removeItem(STORAGE_KEY);
      
      // Force navigation to personal workspace with a slight delay to ensure state updates
      setTimeout(() => {
        if (location.pathname !== '/personal' && !location.pathname.startsWith('/personal')) {
          navigate('/personal', { replace: true });
        }
      }, 10);
      return;
    }

    const group = userGroups.find(g => g.id === groupId);
    if (group) {
      console.log('✅ Switching to group:', group.name);
      setCurrentGroup(group);
      setCurrentPublicGroup(null); // Clear any public group
      localStorage.setItem(STORAGE_KEY, groupId);
      // Only navigate if we're not already on the correct URL
      if (!location.pathname.includes(`/group/${groupId}`)) {
        navigate(`/group/${groupId}`);
      }
    } else {
      console.log('❌ Group not found, checking if it\'s public');
      // If not found in user groups, check if it's a public group
      await checkPublicGroup(groupId);
    }
  }, [currentGroup, currentPublicGroup, location.pathname, navigate, userGroups, checkPublicGroup]);

  // Manual sync method for when URL params aren't detected
  const syncWithUrl = useCallback((urlGroupId: string) => {
    console.log('🔄 Manual URL sync called for group:', urlGroupId);
    
    if (urlGroupId && urlGroupId !== currentGroup?.id && urlGroupId !== currentPublicGroup?.id) {
      if (userGroups.length > 0) {
        const targetGroup = userGroups.find(g => g.id === urlGroupId);
        if (targetGroup) {
          console.log('✅ Manual sync: Found group in user groups, setting as current:', targetGroup.name);
          setCurrentGroup(targetGroup);
          setCurrentPublicGroup(null);
          localStorage.setItem(STORAGE_KEY, urlGroupId);
        } else {
          console.log('❓ Manual sync: Group not found in userGroups, checking if public');
          checkPublicGroup(urlGroupId);
        }
      } else {
        console.log('❓ Manual sync: No user groups loaded, checking if public');
        checkPublicGroup(urlGroupId);
      }
    }
  }, [currentGroup, currentPublicGroup, userGroups, checkPublicGroup]);

  const refreshGroups = useCallback(async () => {
    if (!user) return;
    
    console.log('🔄 Refreshing groups...');
    setIsLoading(true);
    
    try {
      const groups = await groupService.getUserGroups();
      setUserGroups(groups);
      
      // If current group is set, update it with fresh data
      if (currentGroup) {
        const updatedCurrentGroup = groups.find(g => g.id === currentGroup.id);
        if (updatedCurrentGroup) {
          setCurrentGroup(updatedCurrentGroup);
        } else {
          // Current group no longer exists or user no longer has access
          setCurrentGroup(null);
          localStorage.removeItem(STORAGE_KEY);
          navigate('/personal', { replace: true });
        }
      }
    } catch (error) {
      console.error('❌ Failed to refresh groups:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, currentGroup, navigate]);

  const createGroup = useCallback(async (data: CreateGroupRequest) => {
    try {
      console.log('➕ Creating new group:', data.name);
      const newGroup = await groupService.createGroup(data);
      
      // Refresh groups to get the new group with membership info
      await refreshGroups();
      
      // Auto-switch to the new group
      await switchToGroup(newGroup.id);
      
      return newGroup;
    } catch (error) {
      console.error('❌ Failed to create group:', error);
      throw error;
    }
  }, [refreshGroups, switchToGroup]);

  const updateGroup = useCallback(async (groupId: string, data: UpdateGroupRequest) => {
    try {
      console.log('✏️ Updating group:', { groupId, data });
      const updatedGroup = await groupService.updateGroup(groupId, data);
      
      // Refresh groups to get updated data
      await refreshGroups();
      
      return updatedGroup;
    } catch (error) {
      console.error('❌ Failed to update group:', error);
      throw error;
    }
  }, [refreshGroups]);

  const deleteGroup = useCallback(async (groupId: string) => {
    try {
      console.log('🗑️ Deleting group:', groupId);
      await groupService.deleteGroup(groupId);
      
      // If the deleted group was current, switch to Personal
      if (currentGroup?.id === groupId) {
        console.log('🔄 Deleted group was current, switching to personal');
        setCurrentGroup(null);
        localStorage.removeItem(STORAGE_KEY);
        navigate('/personal');
      }
      
      // Refresh groups to remove the deleted group
      await refreshGroups();
    } catch (error) {
      console.error('❌ Failed to delete group:', error);
      throw error;
    }
  }, [currentGroup, navigate, refreshGroups]);

  // New functions for public/private groups functionality
  const getPublicGroup = useCallback(async (groupId: string) => {
    try {
      return await groupService.getPublicGroup(groupId);
    } catch (error) {
      console.error('❌ Failed to get public group:', error);
      throw error;
    }
  }, []);

  const joinPublicGroup = useCallback(async (groupId: string) => {
    try {
      console.log('🤝 Joining public group:', groupId);
      const result = await groupService.joinPublicGroup(groupId);
      
      // Refresh groups to include the newly joined group
      await refreshGroups();
      
      // Switch to the newly joined group
      await switchToGroup(groupId);
      
      return result;
    } catch (error) {
      console.error('❌ Failed to join public group:', error);
      throw error;
    }
  }, [refreshGroups, switchToGroup]);

  const toggleGroupVisibility = useCallback(async (groupId: string, isPublic: boolean) => {
    try {
      console.log('🔄 Toggling group visibility:', { groupId, isPublic });
      const result = await groupService.toggleGroupVisibility(groupId, isPublic);
      
      // Refresh groups to get updated data
      await refreshGroups();
      
      return result;
    } catch (error) {
      console.error('❌ Failed to toggle group visibility:', error);
      throw error;
    }
  }, [refreshGroups]);

  // Memoize the context value to prevent unnecessary re-renders
  const value: GroupContextType = useMemo(() => ({
    currentGroup: currentGroup || (currentPublicGroup ? {
      ...currentPublicGroup,
      role: currentPublicGroup.user_role as 'owner' | 'admin' | 'member' | 'viewer',
      member_count: currentPublicGroup.member_count,
      integration_count: currentPublicGroup.feed_count,
      is_owner: currentPublicGroup.user_role === 'owner',
      can_access: true,
      owner_id: '', // Public groups don't expose owner_id
      updated_at: currentPublicGroup.created_at
    } : null),
    userGroups,
    isLoading,
    switchToGroup,
    createGroup,
    updateGroup,
    deleteGroup,
    refreshGroups,
    syncWithUrl,
    getPublicGroup,
    joinPublicGroup,
    toggleGroupVisibility,
  }), [
    currentGroup,
    currentPublicGroup,
    userGroups,
    isLoading,
    switchToGroup,
    createGroup,
    updateGroup,
    deleteGroup,
    refreshGroups,
    syncWithUrl,
    getPublicGroup,
    joinPublicGroup,
    toggleGroupVisibility
  ]);

  return (
    <GroupContext.Provider value={value}>
      {children}
    </GroupContext.Provider>
  );
}; 