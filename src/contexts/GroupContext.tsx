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
  const groupIdFromUrl = useMemo(() => params.groupId, [params.groupId]);

  console.log('🔄 GroupProvider render:', {
    pathname: location.pathname,
    groupIdFromParams: groupIdFromUrl,
    currentGroupId: currentGroup?.id,
    currentPublicGroupId: currentPublicGroup?.id,
    userGroupsCount: userGroups.length,
    isLoading,
    isCheckingPublicGroup,
    user: user?.id
  });

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

  const refreshGroups = useCallback(async () => {
    if (!user) {
      console.log('❌ No user, skipping group refresh');
      return;
    }
    
    try {
      console.log('🔄 Starting group refresh...');
      setIsLoading(true);
      const groups = await groupService.getUserGroups();
      console.log('✅ Groups loaded:', groups.map(g => ({ id: g.id, name: g.name, role: g.role })));
      setUserGroups(groups);
      
      // If current group is set, update it with fresh data
      if (currentGroup) {
        console.log('🔍 Checking if current group still exists:', currentGroup.id);
        const updatedCurrentGroup = groups.find(g => g.id === currentGroup.id);
        if (updatedCurrentGroup) {
          console.log('✅ Current group updated with fresh data');
          setCurrentGroup(updatedCurrentGroup);
        } else {
          console.log('❌ Current group no longer exists, switching to personal');
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
      console.log('✅ Group refresh completed');
    }
  }, [user, currentGroup, navigate]);

  // Load user's groups when authenticated
  useEffect(() => {
    console.log('👤 User effect triggered:', { userId: user?.id });
    
    if (user) {
      console.log('📥 User authenticated, refreshing groups...');
      refreshGroups();
    } else {
      console.log('🚪 User logged out, clearing groups...');
      // Clear groups when user logs out
      setUserGroups([]);
      setCurrentGroup(null);
      setCurrentPublicGroup(null);
      setIsLoading(false);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user, refreshGroups]);

  // Sync current group with URL parameters - optimized with fewer dependencies
  useEffect(() => {
    console.log('🔗 URL sync effect triggered:', {
      userGroupsLength: userGroups.length,
      pathname: location.pathname,
      groupIdFromUrl,
      currentGroupId: currentGroup?.id,
      currentPublicGroupId: currentPublicGroup?.id,
      isCheckingPublicGroup
    });

    // Skip if still loading user groups or checking public group
    if (isLoading || isCheckingPublicGroup) {
      console.log('⏳ Skipping URL sync - loading or checking public group');
      return;
    }

    if (userGroups.length > 0 || (!user && !isLoading)) {
      if (groupIdFromUrl) {
        console.log('🎯 URL has group ID:', groupIdFromUrl);
        // URL has a group ID, first check user's groups
        const urlGroup = userGroups.find(g => g.id === groupIdFromUrl);
        
        if (urlGroup && urlGroup.id !== currentGroup?.id) {
          console.log('✅ Found group in userGroups, setting as current:', {
            groupName: urlGroup.name,
            groupId: urlGroup.id,
            previousGroupId: currentGroup?.id
          });
          setCurrentGroup(urlGroup);
          setCurrentPublicGroup(null); // Clear any public group
          localStorage.setItem(STORAGE_KEY, urlGroup.id);
        } else if (!urlGroup && !currentPublicGroup) {
          console.log('❓ Group not found in userGroups, checking if it\'s a public group:', {
            requestedGroupId: groupIdFromUrl
          });
          // Group not found in user's groups, check if it's a public group
          checkPublicGroup(groupIdFromUrl);
        } else {
          console.log('ℹ️ Group already current or public group set, no change needed');
        }
      } else if (location.pathname.startsWith('/personal') || location.pathname === '/' || location.pathname === '') {
        console.log('🏠 URL indicates personal workspace, pathname:', location.pathname);
        // URL indicates personal workspace
        if (currentGroup || currentPublicGroup) {
          console.log('🔄 Switching from group to personal workspace, clearing current group:', 
            currentGroup?.name || currentPublicGroup?.name);
          setCurrentGroup(null);
          setCurrentPublicGroup(null);
          localStorage.removeItem(STORAGE_KEY);
        } else {
          console.log('✅ Already in personal mode, no group set');
        }
      } else if (!currentGroup && !currentPublicGroup && !groupIdFromUrl) {
        console.log('💾 No group in URL and no current group, checking localStorage...');
        // No group in URL and no current group, try to restore from localStorage
        const savedGroupId = localStorage.getItem(STORAGE_KEY);
        if (savedGroupId) {
          const savedGroup = userGroups.find(g => g.id === savedGroupId);
          if (savedGroup) {
            console.log('🔄 Restoring group from localStorage and navigating:', {
              savedGroupId,
              groupName: savedGroup.name
            });
            // Only restore if we're not on a personal workspace path
            if (!location.pathname.startsWith('/personal') && location.pathname !== '/') {
              navigate(`/group/${savedGroupId}`, { replace: true });
            } else {
              console.log('⏸️ Not restoring - on personal workspace path');
            }
          } else {
            console.log('⚠️ Saved group not found in userGroups, clearing localStorage');
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      }
    } else {
      console.log('⏳ No user groups loaded yet, skipping URL sync');
    }
  }, [userGroups, groupIdFromUrl, location.pathname, currentGroup, currentPublicGroup, navigate, user, isLoading, isCheckingPublicGroup, checkPublicGroup]);

  const switchToGroup = useCallback(async (groupId: string | null) => {
    console.log('🔄 switchToGroup called:', { 
      groupId, 
      currentGroupId: currentGroup?.id,
      currentPublicGroupId: currentPublicGroup?.id
    });
    
    if (groupId === null) {
      console.log('🏠 Switching to Personal mode');
      // Switch to "Personal" mode
      setCurrentGroup(null);
      setCurrentPublicGroup(null);
      localStorage.removeItem(STORAGE_KEY);
      
      // Force navigation to personal workspace with a slight delay to ensure state updates
      setTimeout(() => {
        if (location.pathname !== '/personal' && !location.pathname.startsWith('/personal')) {
          console.log('🔄 Navigating to /personal from:', location.pathname);
          navigate('/personal', { replace: true });
        } else {
          console.log('✅ Already on personal workspace path');
        }
      }, 10);
      return;
    }

    const group = userGroups.find(g => g.id === groupId);
    if (group) {
      console.log('✅ Group found, switching:', { groupName: group.name, groupId });
      setCurrentGroup(group);
      setCurrentPublicGroup(null); // Clear any public group
      localStorage.setItem(STORAGE_KEY, groupId);
      // Only navigate if we're not already on the correct URL
      if (!location.pathname.includes(`/group/${groupId}`)) {
        navigate(`/group/${groupId}`);
      }
    } else {
      console.log('❌ Group not found, refreshing groups first...');
      // Group not found, try to refresh and find it
      await refreshGroups();
      const refreshedGroup = userGroups.find(g => g.id === groupId);
      if (refreshedGroup) {
        console.log('✅ Group found after refresh, switching:', { groupName: refreshedGroup.name, groupId });
        setCurrentGroup(refreshedGroup);
        setCurrentPublicGroup(null); // Clear any public group
        localStorage.setItem(STORAGE_KEY, groupId);
        // Only navigate if we're not already on the correct URL
        if (!location.pathname.includes(`/group/${groupId}`)) {
          navigate(`/group/${groupId}`);
        }
      } else {
        console.log('❌ Group still not found after refresh, checking if it\'s public');
        // If not found in user groups after refresh, check if it's a public group
        await checkPublicGroup(groupId);
      }
    }
  }, [currentGroup, currentPublicGroup, location.pathname, navigate, userGroups, refreshGroups, checkPublicGroup]);

  // Manual sync method for when URL params aren't detected
  const syncWithUrl = useCallback((urlGroupId: string) => {
    console.log('🔄 Manual URL sync called:', { 
      urlGroupId, 
      currentGroupId: currentGroup?.id,
      currentPublicGroupId: currentPublicGroup?.id
    });
    
    // Don't sync if we're in the middle of switching to personal (both groups are null)
    if (!currentGroup && !currentPublicGroup && !urlGroupId) {
      console.log('⏸️ Skipping sync - all groups null (switching to personal)');
      return;
    }
    
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
      console.log('🌐 Getting public group:', groupId);
      return await groupService.getPublicGroup(groupId);
    } catch (error) {
      console.error('❌ Failed to get public group:', error);
      throw error;
    }
  }, []);

  const joinPublicGroup = useCallback(async (groupId: string) => {
    try {
      console.log('👥 Joining public group:', groupId);
      const result = await groupService.joinPublicGroup(groupId);
      
      if (result.success) {
        // Refresh groups to include the newly joined group
        await refreshGroups();
      }
      
      return result;
    } catch (error) {
      console.error('❌ Failed to join public group:', error);
      throw error;
    }
  }, [refreshGroups]);

  const toggleGroupVisibility = useCallback(async (groupId: string, isPublic: boolean) => {
    try {
      console.log('🔄 Toggling group visibility:', { groupId, isPublic });
      const result = await groupService.toggleGroupVisibility(groupId, isPublic);
      
      if (result.success) {
        // Refresh groups to get updated visibility status
        await refreshGroups();
      }
      
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

  console.log('📤 GroupProvider providing value:', {
    currentGroupId: currentGroup?.id || currentPublicGroup?.id,
    currentGroupName: currentGroup?.name || currentPublicGroup?.name,
    isPublicGroup: !!currentPublicGroup,
    userGroupsCount: userGroups.length,
    isLoading
  });

  return (
    <GroupContext.Provider value={value}>
      {children}
    </GroupContext.Provider>
  );
}; 