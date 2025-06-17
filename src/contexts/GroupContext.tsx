import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { groupService } from '../services/groupService';
import type { GroupContextType, GroupWithMembership, CreateGroupRequest, UpdateGroupRequest } from '../types/group';
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
  const [userGroups, setUserGroups] = useState<GroupWithMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  console.log('🔄 GroupProvider render:', {
    pathname: location.pathname,
    groupIdFromParams: params.groupId,
    currentGroupId: currentGroup?.id,
    userGroupsCount: userGroups.length,
    isLoading,
    user: user?.id
  });

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
      setIsLoading(false);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

  // Sync current group with URL parameters
  useEffect(() => {
    console.log('🔗 URL sync effect triggered:', {
      userGroupsLength: userGroups.length,
      pathname: location.pathname,
      groupIdFromUrl: params.groupId,
      currentGroupId: currentGroup?.id
    });

    if (userGroups.length > 0) {
      const groupIdFromUrl = params.groupId;
      
      if (groupIdFromUrl) {
        console.log('🎯 URL has group ID:', groupIdFromUrl);
        // URL has a group ID, find and set that group
        const urlGroup = userGroups.find(g => g.id === groupIdFromUrl);
        
        if (urlGroup && urlGroup.id !== currentGroup?.id) {
          console.log('✅ Found group in userGroups, setting as current:', {
            groupName: urlGroup.name,
            groupId: urlGroup.id,
            previousGroupId: currentGroup?.id
          });
          setCurrentGroup(urlGroup);
          localStorage.setItem(STORAGE_KEY, urlGroup.id);
        } else if (!urlGroup) {
          console.log('❌ Group not found in userGroups, redirecting to personal:', {
            requestedGroupId: groupIdFromUrl,
            availableGroups: userGroups.map(g => ({ id: g.id, name: g.name }))
          });
          // Group not found or user doesn't have access, redirect to personal
          navigate('/personal', { replace: true });
        } else {
          console.log('ℹ️ Group already current, no change needed');
        }
      } else if (location.pathname.startsWith('/personal') || location.pathname === '/' || location.pathname === '') {
        console.log('🏠 URL indicates personal workspace, pathname:', location.pathname);
        // URL indicates personal workspace
        if (currentGroup) {
          console.log('🔄 Switching from group to personal workspace, clearing current group:', currentGroup.name);
          setCurrentGroup(null);
          localStorage.removeItem(STORAGE_KEY);
        } else {
          console.log('✅ Already in personal mode, no group set');
        }
      } else if (!currentGroup) {
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
  }, [userGroups, params.groupId, location.pathname, currentGroup, navigate]);

  const refreshGroups = async () => {
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
  };

  const switchToGroup = async (groupId: string | null) => {
    console.log('🔄 switchToGroup called:', { groupId, currentGroupId: currentGroup?.id });
    
    if (groupId === null) {
      console.log('🏠 Switching to Personal mode');
      // Switch to "Personal" mode
      setCurrentGroup(null);
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
        localStorage.setItem(STORAGE_KEY, groupId);
        // Only navigate if we're not already on the correct URL
        if (!location.pathname.includes(`/group/${groupId}`)) {
          navigate(`/group/${groupId}`);
        }
      } else {
        console.log('❌ Group still not found after refresh');
      }
    }
  };

  // Manual sync method for when URL params aren't detected
  const syncWithUrl = (urlGroupId: string) => {
    console.log('🔄 Manual URL sync called:', { urlGroupId, currentGroupId: currentGroup?.id });
    
    // Don't sync if we're in the middle of switching to personal (currentGroup is null)
    if (!currentGroup && !urlGroupId) {
      console.log('⏸️ Skipping sync - both current group and URL group are null (switching to personal)');
      return;
    }
    
    if (urlGroupId && urlGroupId !== currentGroup?.id && userGroups.length > 0) {
      const targetGroup = userGroups.find(g => g.id === urlGroupId);
      if (targetGroup) {
        console.log('✅ Manual sync: Found group, setting as current:', targetGroup.name);
        setCurrentGroup(targetGroup);
        localStorage.setItem(STORAGE_KEY, urlGroupId);
      } else {
        console.log('❌ Manual sync: Group not found in userGroups');
      }
    }
  };

  const createGroup = async (data: CreateGroupRequest) => {
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
  };

  const updateGroup = async (groupId: string, data: UpdateGroupRequest) => {
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
  };

  const deleteGroup = async (groupId: string) => {
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
  };

  const value: GroupContextType = {
    currentGroup,
    userGroups,
    isLoading,
    switchToGroup,
    createGroup,
    updateGroup,
    deleteGroup,
    refreshGroups,
    syncWithUrl,
  };

  console.log('📤 GroupProvider providing value:', {
    currentGroupId: currentGroup?.id,
    currentGroupName: currentGroup?.name,
    userGroupsCount: userGroups.length,
    isLoading
  });

  return (
    <GroupContext.Provider value={value}>
      {children}
    </GroupContext.Provider>
  );
}; 