import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGroup } from '../../contexts/GroupContext';
import { useAuth } from '../../contexts/AuthContext';
import { getFeeds, getAllFeedItems, addFeed, updateFeed, deleteFeed } from '../../services/feedService';
import { debugCheckGroupVisibility } from '../../services/groupService';
import { useFeedUpdates, useManualFeedUpdate } from '../../hooks/useFeedUpdates';
import { sanitizeAndTruncate } from '../../utils/textSanitizer';
import { MemberManagement } from './MemberManagement';
import { PublicGroupView } from './PublicGroupView';
import { GroupVisibilityToggle } from './GroupVisibilityToggle';
import { GroupVisibilityBadge } from './GroupVisibilityBadge';
import type { Feed, FeedItem } from '../../types/feed';
import { 
  getRoleBadgeColor,
  canManageIntegrations
} from '../../utils/permissions';
import React from 'react';

interface GroupDashboardProps {
  groupId?: string;
}

export const GroupDashboard = React.memo<GroupDashboardProps>(({ groupId }) => {
  const { currentGroup, currentPublicGroup, userGroups, syncWithUrl } = useGroup();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  console.log('🏗️ [DEBUG] GroupDashboard rendered with:', {
    groupId,
    currentGroupId: currentGroup?.id,
    currentGroupName: currentGroup?.name,
    currentPublicGroupId: currentPublicGroup?.id,
    currentPublicGroupName: currentPublicGroup?.name,
    isUserAuthenticated: !!user,
    userGroupsCount: userGroups.length
  });

  // Form states for adding integrations - ALWAYS call hooks first
  const [feedUrl, setFeedUrl] = useState('');
  const [integrationName, setIntegrationName] = useState('');
  const [integrationAlias, setIntegrationAlias] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingFeed, setEditingFeed] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAlias, setEditAlias] = useState('');
  const [deletingFeed, setDeletingFeed] = useState<string | null>(null);

  // Memoize values to prevent unnecessary re-renders
  const shouldSyncWithUrl = useMemo(() => {
    // Only sync for authenticated users
    return user && groupId && !currentGroup && !currentPublicGroup && userGroups.length > 0;
  }, [groupId, currentGroup, currentPublicGroup, userGroups.length, user]);

  // Hook for manual feed updates - ALWAYS call hooks
  const { updateAllFeeds, isUpdating, lastUpdate } = useManualFeedUpdate(currentGroup?.id);

  // Fetch feeds for the current group - ALWAYS call hooks
  const { data: feedsData, isLoading: feedsLoading } = useQuery({
    queryKey: ['feeds', user?.id, currentGroup?.id],
    queryFn: () => getFeeds(currentGroup!.id),
    enabled: !!user && !!currentGroup && !currentPublicGroup,
  });

  // Fetch recent feed items for the current group - ALWAYS call hooks
  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['allFeedItems', user?.id, currentGroup?.id],
    queryFn: () => getAllFeedItems(currentGroup!.id),
    enabled: !!user && !!currentGroup && !currentPublicGroup,
  });

  // Listen for feed updates - ALWAYS call hooks
  useFeedUpdates(undefined, currentGroup?.id);

  // Debug: Check group visibility when groupId changes
  useEffect(() => {
    if (groupId) {
      debugCheckGroupVisibility(groupId).then(result => {
        console.log('🔍 [DEBUG] Group visibility debug result:', result);
      });
    }
  }, [groupId]);

  // Add feed mutation - ALWAYS call hooks
  const addFeedMutation = useMutation({
    mutationFn: ({ url, name, alias }: { url: string; name: string; alias?: string }) =>
      addFeed(url, name, alias, currentGroup!.id),
    onSuccess: () => {
      // Invalidate only current group queries
      queryClient.invalidateQueries({ 
        queryKey: ['feeds', user?.id, currentGroup!.id],
        exact: true 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['allFeedItems', user?.id, currentGroup!.id],
        exact: true 
      });
      setFeedUrl('');
      setIntegrationName('');
      setIntegrationAlias('');
      setShowAddForm(false);
    },
  });

  // Update feed mutation - ALWAYS call hooks
  const updateFeedMutation = useMutation({
    mutationFn: ({ id, name, alias }: { id: string; name: string; alias?: string }) =>
      updateFeed(id, name, alias),
    onSuccess: () => {
      // Invalidate only current group queries
      queryClient.invalidateQueries({ 
        queryKey: ['feeds', user?.id, currentGroup!.id],
        exact: true 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['allFeedItems', user?.id, currentGroup!.id],
        exact: true 
      });
      setEditingFeed(null);
      setEditName('');
      setEditAlias('');
    },
  });

  // Delete feed mutation - ALWAYS call hooks
  const deleteFeedMutation = useMutation({
    mutationFn: (id: string) => deleteFeed(id),
    onSuccess: () => {
      // Invalidate only current group queries
      queryClient.invalidateQueries({ 
        queryKey: ['feeds', user?.id, currentGroup!.id],
        exact: true 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['allFeedItems', user?.id, currentGroup!.id],
        exact: true 
      });
      setDeletingFeed(null);
    },
  });

  // Sync with group context if we have a groupId prop but no currentGroup - AFTER all hooks
  useEffect(() => {
    if (shouldSyncWithUrl) {
      syncWithUrl(groupId!);
    }
  }, [shouldSyncWithUrl, syncWithUrl, groupId]);

  // Memoized handlers to prevent unnecessary re-renders
  const handleManualUpdate = useCallback(async () => {
    const result = await updateAllFeeds();
    if (result.success) {
      // Invalidate only current group queries, not all queries
      queryClient.invalidateQueries({ 
        queryKey: ['feeds', user?.id, currentGroup?.id],
        exact: true 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['allFeedItems', user?.id, currentGroup?.id],
        exact: true 
      });
    }
  }, [updateAllFeeds, queryClient, user?.id, currentGroup?.id]);

  // All other handler functions go here...
  const handleAddFeed = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedUrl || !integrationName) return;

    setIsSubmitting(true);
    try {
      await addFeedMutation.mutateAsync({
        url: feedUrl,
        name: integrationName,
        alias: integrationAlias || undefined,
      });
    } catch (error) {
      console.error('Failed to add feed:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [feedUrl, integrationName, integrationAlias, addFeedMutation]);

  const handleEditFeed = useCallback((feed: Feed) => {
    setEditingFeed(feed.id);
    setEditName(feed.integrationName);
    setEditAlias(feed.integrationAlias || '');
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingFeed || !editName) return;

    try {
      await updateFeedMutation.mutateAsync({
        id: editingFeed,
        name: editName,
        alias: editAlias || undefined,
      });
    } catch (error) {
      console.error('Failed to update feed:', error);
    }
  }, [editingFeed, editName, editAlias, updateFeedMutation]);

  const handleCancelEdit = useCallback(() => {
    setEditingFeed(null);
    setEditName('');
    setEditAlias('');
  }, []);

  const handleDeleteFeed = useCallback(async (id: string) => {
    try {
      await deleteFeedMutation.mutateAsync(id);
    } catch (error) {
      console.error('Failed to delete feed:', error);
    }
  }, [deleteFeedMutation]);

  // NOW we can do conditional rendering AFTER all hooks are called
  
  // Show public group view if we have a public group
  if (currentPublicGroup) {
    console.log('🌍 [DEBUG] Rendering PublicGroupView for:', currentPublicGroup.name);
    return <PublicGroupView group={currentPublicGroup} />;
  }

  // Show loading state while checking for public group or if we're waiting for group context
  if (groupId && !currentGroup && !currentPublicGroup && user && userGroups.length === 0) {
    console.log('⏳ [DEBUG] Rendering loading state - checking public group or waiting for context');
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="text-white text-lg">Loading group...</div>
      </div>
    );
  }

  // Early return if we don't have required data yet
  if (!currentGroup) {
    console.log('❌ [DEBUG] No currentGroup found, rendering loading state');
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="text-white text-lg">Loading group...</div>
      </div>
    );
  }

  console.log('👥 [DEBUG] Rendering normal GroupDashboard for member view:', {
    groupName: currentGroup.name,
    userRole: currentGroup.role
  });

  const feeds = feedsData?.feeds || [];
  const recentItems = itemsData?.items?.slice(0, 8) || [];
  const canManage = canManageIntegrations(currentGroup.role);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getIntegrationColor = (integrationName: string) => {
    const colors = [
      { bg: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', text: 'white', accent: '#3b82f6' },
      { bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', text: 'white', accent: '#10b981' },
      { bg: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', text: 'white', accent: '#8b5cf6' },
      { bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', text: 'white', accent: '#f59e0b' },
      { bg: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)', text: 'white', accent: '#ec4899' },
      { bg: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', text: 'white', accent: '#6366f1' },
      { bg: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', text: 'white', accent: '#ef4444' },
      { bg: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)', text: 'white', accent: '#eab308' },
    ];
    
    const hash = integrationName.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    
    return colors[Math.abs(hash) % colors.length];
  };

  const getTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="min-h-screen gradient-bg">
      {/* Group Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-blue-700">
                  {currentGroup.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{currentGroup.name}</h1>
                {currentGroup.description && (
                  <p className="text-gray-600 mt-1">{currentGroup.description}</p>
                )}
                <div className="flex items-center space-x-4 mt-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getRoleBadgeColor(currentGroup.role)}`}>
                    {currentGroup.role.charAt(0).toUpperCase() + currentGroup.role.slice(1)}
                  </span>
                  <GroupVisibilityBadge group={currentGroup} size="sm" />
                  <span className="text-sm text-gray-500">
                    Created {formatDate(currentGroup.created_at)}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Group Settings - Right Side */}
            <div className="flex flex-col items-end gap-3">
              <GroupVisibilityToggle group={currentGroup} />
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900">{currentGroup.member_count}</h3>
                  <p className="text-sm text-gray-600">
                    {currentGroup.member_count === 1 ? 'Member' : 'Members'}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900">{feeds.length}</h3>
                  <p className="text-sm text-gray-600">
                    {feeds.length === 1 ? 'Integration' : 'Integrations'}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900">Active</h3>
                  <p className="text-sm text-gray-600">Status</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Group Integrations Section */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">
              Group Integrations ({feeds.length})
            </h2>
            <div className="flex gap-3">
              {/* Manual Update Button */}
              <button
                onClick={handleManualUpdate}
                disabled={isUpdating}
                className="modern-button text-sm bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Update all feeds manually"
              >
                <svg className={`icon-sm ${isUpdating ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {isUpdating ? 'Updating...' : 'Refresh Feeds'}
              </button>

              {/* Add Integration Button */}
              {canManage && (
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="modern-button text-sm"
                >
                  <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Integration
                </button>
              )}
            </div>
          </div>

          {/* Status Message for Manual Update */}
          {lastUpdate && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${
              lastUpdate.success 
                ? (lastUpdate.newItems && lastUpdate.newItems > 0 
                    ? 'bg-green-50 text-green-800 border border-green-200'
                    : 'bg-blue-50 text-blue-800 border border-blue-200'
                  )
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              <div className="flex items-center gap-2">
                {lastUpdate.success ? (
                  lastUpdate.newItems && lastUpdate.newItems > 0 ? (
                    <svg className="icon-sm text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="icon-sm text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )
                ) : (
                  <svg className="icon-sm text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                <span>
                  {lastUpdate.message}
                  {lastUpdate.newItems !== undefined && lastUpdate.newItems > 0 && (
                    <span className="font-semibold"> - {lastUpdate.newItems} new elements found</span>
                  )}
                </span>
                <span className="text-xs text-gray-500 ml-auto">
                  {lastUpdate.timestamp.toLocaleTimeString()}
                </span>
              </div>
            </div>
          )}

          {feedsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-gray-200 rounded-xl h-24 animate-pulse"></div>
              ))}
            </div>
          ) : feeds.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border-2 border-dashed border-gray-300">
              <svg className="icon-xl text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No integrations yet</h3>
              <p className="text-gray-500 mb-4">Add your first integration to start monitoring updates for this group</p>
              {canManage && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="modern-button"
                >
                  Add Your First Integration
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {feeds.map((feed: Feed) => {
                const colorScheme = getIntegrationColor(feed.integrationName);
                const isEditing = editingFeed === feed.id;
                
                return (
                  <div
                    key={feed.id}
                    className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:shadow-md transition-all duration-200 group relative"
                  >
                    {/* Management buttons */}
                    {canManage && (
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button
                          onClick={() => handleEditFeed(feed)}
                          className="p-1 bg-blue-100 text-blue-600 rounded-md hover:bg-blue-200 transition-colors"
                          title="Edit integration"
                        >
                          <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeletingFeed(feed.id)}
                          className="p-1 bg-red-100 text-red-600 rounded-md hover:bg-red-200 transition-colors"
                          title="Delete integration"
                        >
                          <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}

                    <div className="text-center">
                      <div 
                        style={{ 
                          width: '3rem', 
                          height: '3rem', 
                          background: colorScheme.bg,
                          borderRadius: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: colorScheme.text,
                          fontWeight: 'bold',
                          fontSize: '1.125rem',
                          margin: '0 auto 0.75rem'
                        }}
                      >
                        {(feed.integrationAlias || feed.integrationName).charAt(0).toUpperCase()}
                      </div>
                      
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full text-sm px-2 py-1 border border-gray-300 rounded text-center"
                            placeholder="Integration name"
                          />
                          <input
                            type="text"
                            value={editAlias}
                            onChange={(e) => setEditAlias(e.target.value)}
                            className="w-full text-xs px-2 py-1 border border-gray-300 rounded text-center"
                            placeholder="Alias (optional)"
                          />
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={handleSaveEdit}
                              className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="px-2 py-1 bg-gray-400 text-white text-xs rounded hover:bg-gray-500"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3 className="font-medium text-gray-900 text-sm mb-1 truncate">
                            {feed.integrationName}
                          </h3>
                          {feed.integrationAlias && (
                            <p className="text-xs text-gray-500 truncate">
                              {feed.integrationAlias}
                            </p>
                          )}
                          <div className="mt-2 text-xs text-gray-400">
                            Updated {new Date(feed.lastFetched).toLocaleDateString()}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Form */}
          {showAddForm && canManage && (
            <div className="mt-6 bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <form onSubmit={handleAddFeed} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Integration Name
                    </label>
                    <input
                      type="text"
                      value={integrationName}
                      onChange={(e) => setIntegrationName(e.target.value)}
                      placeholder="e.g., Stripe, GitHub, AWS"
                      className="modern-input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Alias (Optional)
                    </label>
                    <input
                      type="text"
                      value={integrationAlias}
                      onChange={(e) => setIntegrationAlias(e.target.value)}
                      placeholder="e.g., Payment API, Main Repo"
                      className="modern-input"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    RSS Feed URL
                  </label>
                  <input
                    type="url"
                    value={feedUrl}
                    onChange={(e) => setFeedUrl(e.target.value)}
                    placeholder="https://example.com/changelog.rss"
                    className="modern-input"
                    required
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="secondary-button"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !feedUrl || !integrationName}
                    className="modern-button"
                  >
                    {isSubmitting ? 'Adding...' : 'Add Integration'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Member Management Section */}
        <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200">
          <MemberManagement 
            groupId={currentGroup.id} 
            userRole={currentGroup.role} 
          />
        </div>

        {/* Recent Updates Section */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Recent Group Updates</h2>
            {recentItems.length > 0 && (
              <Link to={`/group/${currentGroup.id}/updates`} className="secondary-button">
                View All Updates →
              </Link>
            )}
          </div>

          {itemsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-white/10 rounded-xl h-48 animate-pulse"></div>
              ))}
            </div>
          ) : recentItems.length === 0 ? (
            <div className="text-center py-16">
              <svg className="icon-xl text-white/50 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
              <h3 className="text-xl font-semibold text-white mb-2">No updates yet</h3>
              <p className="text-blue-200">Add some integrations to see their latest updates here</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {recentItems.map((item: FeedItem) => {
                const colorScheme = getIntegrationColor(item.integrationName);
                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group"
                    onClick={() => window.open(item.link, '_blank')}
                  >
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-4">
                      <div 
                        style={{ 
                          width: '2rem', 
                          height: '2rem', 
                          background: colorScheme.bg,
                          borderRadius: '0.5rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: colorScheme.text,
                          fontWeight: 'bold',
                          fontSize: '0.875rem'
                        }}
                      >
                        {(item.integrationAlias || item.integrationName).charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {item.integrationAlias || item.integrationName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {getTimeAgo(item.pubDate)}
                        </p>
                      </div>
                    </div>

                    {/* Content */}
                    <h3 className="font-medium text-gray-900 mb-2 line-clamp-2 text-sm leading-tight">
                      {item.title}
                    </h3>
                    
                    {item.contentSnippet && (
                      <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed">
                        {sanitizeAndTruncate(item.contentSnippet, 120)}
                      </p>
                    )}

                    {/* Footer */}
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">
                          {new Date(item.pubDate).toLocaleDateString()}
                        </span>
                        <svg className="icon-sm text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deletingFeed && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)' }}
        >
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Integration</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this integration? This action cannot be undone and will remove all associated feed items.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingFeed(null)}
                className="secondary-button"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteFeed(deletingFeed)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

GroupDashboard.displayName = 'GroupDashboard'; 