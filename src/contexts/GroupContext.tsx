import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
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

  // Use refs to prevent unnecessary effect triggers
  const lastGroupIdRef = useRef<string | undefined>(undefined);
  const lastUserIdRef = useRef<string | undefined>(undefined);
  const isInitializedRef = useRef(false);

  // Memoize the current group ID from URL to prevent unnecessary effects
  const groupIdFromUrl = useMemo(() => {
    return params.groupId;
  }, [params.groupId]);

  // Simplified public group check - no excessive logging
  const checkPublicGroup = useCallback(async (groupId: string) => {
    if (isCheckingPublicGroup) return; // Prevent multiple concurrent checks
    
    console.log('🔍 [GroupContext DEBUG] checkPublicGroup called:', {
      groupId,
      isUserAuthenticated: !!user,
      isCheckingPublicGroup
    });
    
    try {
      setIsCheckingPublicGroup(true);
      const publicGroup = await groupService.getPublicGroup(groupId);
      
      console.log('📊 [GroupContext DEBUG] Public group result:', {
        found: !!publicGroup,
        groupName: publicGroup?.name,
        isPublic: publicGroup?.is_public,
        userRole: publicGroup?.user_role
      });
      
      if (publicGroup) {
        setCurrentPublicGroup(publicGroup);
        setCurrentGroup(null);
        localStorage.removeItem(STORAGE_KEY);
      } else {
        // Only redirect to personal if user is authenticated
        // If not authenticated, let the PublicGroupGuard handle the redirect to login
        if (user) {
          navigate('/personal', { replace: true });
        }
      }
    } catch (error) {
      console.error('Error checking public group:', error);
      // Only redirect to personal if user is authenticated
      if (user) {
        navigate('/personal', { replace: true });
      }
    } finally {
      setIsCheckingPublicGroup(false);
    }
  }, [navigate, isCheckingPublicGroup, user]);

  // Load user's groups - simplified effect
  useEffect(() => {
    if (!user?.id || lastUserIdRef.current === user.id) return;
    lastUserIdRef.current = user.id;

    const loadGroups = async () => {
      setIsLoading(true);
      try {
        const groups = await groupService.getUserGroups();
        setUserGroups(groups);
        isInitializedRef.current = true;
      } catch (error) {
        console.error('Failed to load groups:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadGroups();
  }, [user?.id]);

  // Clear state when user logs out
  useEffect(() => {
    if (!user) {
      setUserGroups([]);
      setCurrentGroup(null);
      setCurrentPublicGroup(null);
      setIsLoading(false);
      localStorage.removeItem(STORAGE_KEY);
      lastUserIdRef.current = undefined;
      isInitializedRef.current = false;
    }
  }, [user]);

  // Simplified URL sync - only when necessary
  useEffect(() => {
    // Skip if still loading or checking public group
    if (isLoading || isCheckingPublicGroup) {
      return;
    }

    // Skip if group ID hasn't changed
    if (lastGroupIdRef.current === groupIdFromUrl) {
      return;
    }
    lastGroupIdRef.current = groupIdFromUrl;

    if (groupIdFromUrl) {
      if (user) {
        // User is authenticated - check user's groups first
        if (isInitializedRef.current) {
          const urlGroup = userGroups.find(g => g.id === groupIdFromUrl);
          
          if (urlGroup) {
            if (urlGroup.id !== currentGroup?.id) {
              setCurrentGroup(urlGroup);
              setCurrentPublicGroup(null);
              localStorage.setItem(STORAGE_KEY, urlGroup.id);
            }
          } else if (!currentPublicGroup) {
            // Not in user groups, check if public
            localStorage.removeItem(STORAGE_KEY);
            checkPublicGroup(groupIdFromUrl);
          }
        }
      } else {
        // No user - check if it's a public group
        if (!currentPublicGroup) {
          checkPublicGroup(groupIdFromUrl);
        }
      }
    } else {
      // No group ID in URL - personal workspace
      if (currentGroup || currentPublicGroup) {
        setCurrentGroup(null);
        setCurrentPublicGroup(null);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [groupIdFromUrl, userGroups, currentGroup?.id, currentPublicGroup?.id, isLoading, isCheckingPublicGroup, user, checkPublicGroup, isInitializedRef.current]);

  // Initialize for non-authenticated users
  useEffect(() => {
    if (!user && !isInitializedRef.current) {
      setIsLoading(false);
      isInitializedRef.current = true;
    }
  }, [user]);

  const switchToGroup = useCallback(async (groupId: string | null) => {    
    if (groupId === null) {
      setCurrentGroup(null);
      setCurrentPublicGroup(null);
      localStorage.removeItem(STORAGE_KEY);
      navigate('/personal', { replace: true });
      return;
    }

    const group = userGroups.find(g => g.id === groupId);
    if (group) {
      setCurrentGroup(group);
      setCurrentPublicGroup(null);
      localStorage.setItem(STORAGE_KEY, groupId);
      if (!location.pathname.includes(`/group/${groupId}`)) {
        navigate(`/group/${groupId}`);
      }
    } else {
      await checkPublicGroup(groupId);
    }
  }, [userGroups, location.pathname, navigate, checkPublicGroup]);

  const syncWithUrl = useCallback((urlGroupId: string) => {    
    if (urlGroupId && urlGroupId !== currentGroup?.id && urlGroupId !== currentPublicGroup?.id) {
      if (userGroups.length > 0) {
        const targetGroup = userGroups.find(g => g.id === urlGroupId);
        if (targetGroup) {
          setCurrentGroup(targetGroup);
          setCurrentPublicGroup(null);
          localStorage.setItem(STORAGE_KEY, urlGroupId);
        } else {
          checkPublicGroup(urlGroupId);
        }
      } else {
        checkPublicGroup(urlGroupId);
      }
    }
  }, [currentGroup?.id, currentPublicGroup?.id, userGroups, checkPublicGroup]);

  const refreshGroups = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const groups = await groupService.getUserGroups();
      setUserGroups(groups);
      
      // Update current group if it exists
      if (currentGroup) {
        const updatedCurrentGroup = groups.find(g => g.id === currentGroup.id);
        if (updatedCurrentGroup) {
          setCurrentGroup(updatedCurrentGroup);
        } else {
          setCurrentGroup(null);
          localStorage.removeItem(STORAGE_KEY);
          navigate('/personal', { replace: true });
        }
      }
    } catch (error) {
      console.error('Failed to refresh groups:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, currentGroup, navigate]);

  const createGroup = useCallback(async (data: CreateGroupRequest) => {
    try {
      const newGroup = await groupService.createGroup(data);
      
      // Refresh groups and set new group as current
      const groups = await groupService.getUserGroups();
      setUserGroups(groups);
      
      const createdGroupWithMembership = groups.find(g => g.id === newGroup.id);
      
      if (createdGroupWithMembership) {
        setCurrentGroup(createdGroupWithMembership);
        setCurrentPublicGroup(null);
        localStorage.setItem(STORAGE_KEY, newGroup.id);
        navigate(`/group/${newGroup.id}`, { replace: true });
      } else {
        await refreshGroups();
      }
      
      return newGroup;
    } catch (error) {
      console.error('Failed to create group:', error);
      throw error;
    }
  }, [navigate, refreshGroups]);

  const updateGroup = useCallback(async (groupId: string, data: UpdateGroupRequest) => {
    try {
      const updatedGroup = await groupService.updateGroup(groupId, data);
      await refreshGroups();
      return updatedGroup;
    } catch (error) {
      console.error('Failed to update group:', error);
      throw error;
    }
  }, [refreshGroups]);

  const deleteGroup = useCallback(async (groupId: string) => {
    try {
      await groupService.deleteGroup(groupId);
      
      if (currentGroup?.id === groupId) {
        setCurrentGroup(null);
        localStorage.removeItem(STORAGE_KEY);
        navigate('/personal');
      }
      
      await refreshGroups();
    } catch (error) {
      console.error('Failed to delete group:', error);
      throw error;
    }
  }, [currentGroup, navigate, refreshGroups]);

  const getPublicGroup = useCallback(async (groupId: string) => {
    try {
      return await groupService.getPublicGroup(groupId);
    } catch (error) {
      console.error('Failed to get public group:', error);
      throw error;
    }
  }, []);

  const joinPublicGroup = useCallback(async (groupId: string) => {
    try {
      const result = await groupService.joinPublicGroup(groupId);
      await refreshGroups();
      await switchToGroup(groupId);
      return result;
    } catch (error) {
      console.error('Failed to join public group:', error);
      throw error;
    }
  }, [refreshGroups, switchToGroup]);

  const toggleGroupVisibility = useCallback(async (groupId: string, isPublic: boolean) => {
    try {
      const result = await groupService.toggleGroupVisibility(groupId, isPublic);
      await refreshGroups();
      return result;
    } catch (error) {
      console.error('Failed to toggle group visibility:', error);
      throw error;
    }
  }, [refreshGroups]);

  // Memoize the context value to prevent unnecessary re-renders
  const value: GroupContextType = useMemo(() => {
    console.log('🔄 [GroupContext DEBUG] Context value memoization:', {
      hasCurrentGroup: !!currentGroup,
      hasCurrentPublicGroup: !!currentPublicGroup,
      currentGroupName: currentGroup?.name,
      currentPublicGroupName: currentPublicGroup?.name,
      isUserAuthenticated: !!user
    });

    // For authenticated users: merge public group into currentGroup if they're a member
    // For non-authenticated users: keep currentGroup separate from public groups
    let contextCurrentGroup = currentGroup;
    
    if (user && !currentGroup && currentPublicGroup && currentPublicGroup.user_role !== 'none') {
      // Authenticated user who is a member of a public group
      contextCurrentGroup = {
        ...currentPublicGroup,
        role: currentPublicGroup.user_role as 'owner' | 'admin' | 'member' | 'viewer',
        member_count: currentPublicGroup.member_count,
        integration_count: currentPublicGroup.feed_count,
        is_owner: currentPublicGroup.user_role === 'owner',
        can_access: true,
        owner_id: '',
        updated_at: currentPublicGroup.created_at
      };
    }
    // For non-authenticated users or users who are not members: keep currentGroup as null
    // This will allow GroupDashboard to properly detect and show PublicGroupView

    console.log('🎯 [GroupContext DEBUG] Final context group:', {
      hasContextCurrentGroup: !!contextCurrentGroup,
      contextGroupName: contextCurrentGroup?.name,
      contextGroupRole: contextCurrentGroup?.role,
      shouldShowPublicView: !user || (currentPublicGroup?.user_role === 'none')
    });

    return {
      currentGroup: contextCurrentGroup,
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
      toggleGroupVisibility,
    };
  }, [
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
    toggleGroupVisibility,
    user
  ]);

  return (
    <GroupContext.Provider value={value}>
      {children}
    </GroupContext.Provider>
  );
}; 