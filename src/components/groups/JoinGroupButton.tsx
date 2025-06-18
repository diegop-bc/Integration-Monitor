import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { groupService } from '../../services/groupService';
import type { PublicGroup } from '../../types/group';

interface JoinGroupButtonProps {
  group: PublicGroup;
  onJoinSuccess?: () => void;
}

export function JoinGroupButton({ group, onJoinSuccess }: JoinGroupButtonProps) {
  const { user } = useAuth();
  const [isJoining, setIsJoining] = useState(false);
  const [joinResult, setJoinResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleJoinGroup = async () => {
    if (!user) {
      // Redirect to login if not authenticated
      window.location.href = '/login';
      return;
    }

    setIsJoining(true);
    setJoinResult(null);

    try {
      const result = await groupService.joinPublicGroup(group.id);
      setJoinResult(result);
      
      if (result.success) {
        // Call success callback if provided
        if (onJoinSuccess) {
          onJoinSuccess();
        } else {
          // Default behavior: refresh the page to show the group as a member
          window.location.reload();
        }
      }
    } catch (error) {
      console.error('Failed to join group:', error);
      setJoinResult({
        success: false,
        message: 'Failed to join group. Please try again.'
      });
    } finally {
      setIsJoining(false);
    }
  };

  // Don't show button if user can't join or is already a member
  if (!group.can_join || group.user_role !== 'none') {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleJoinGroup}
        disabled={isJoining}
        className="modern-button bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isJoining ? (
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Joining...
          </div>
        ) : (
          user ? 'Join Group' : 'Sign Up to Join'
        )}
      </button>
      
      {joinResult && (
        <div className={`text-sm px-3 py-2 rounded-md max-w-xs text-center ${
          joinResult.success 
            ? 'bg-green-100 text-green-800 border border-green-200' 
            : 'bg-red-100 text-red-800 border border-red-200'
        }`}>
          {joinResult.message}
        </div>
      )}
    </div>
  );
} 