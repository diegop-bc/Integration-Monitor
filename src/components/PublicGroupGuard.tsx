import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { groupService } from '../services/groupService';

export function PublicGroupGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { groupId } = useParams();
  const [isPublicGroup, setIsPublicGroup] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!groupId) {
      setIsLoading(false);
      setIsPublicGroup(false);
      return;
    }

    const checkPublicGroup = async () => {
      try {
        setIsLoading(true);
        const group = await groupService.getPublicGroup(groupId);
        setIsPublicGroup(!!group);
      } catch (error) {
        console.error('Error checking public group:', error);
        setIsPublicGroup(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkPublicGroup();
  }, [groupId]);

  // Show loading while checking
  if (isLoading) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  // If it's not a public group and user is not authenticated, redirect to login
  if (isPublicGroup === false && !user) {
    return <Navigate to="/login" replace />;
  }

  // Allow access to public groups without authentication
  // The GroupContext and Dashboard will handle showing the appropriate view
  return <>{children}</>;
} 