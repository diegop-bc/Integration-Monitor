import React, { useState } from 'react';
import { useGroup } from '../../contexts/GroupContext';
import { canToggleGroupVisibility } from '../../utils/permissions';
import type { GroupWithMembership } from '../../types/group';

interface GroupVisibilityToggleProps {
  group: GroupWithMembership;
  className?: string;
}

interface ConfirmVisibilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: GroupWithMembership;
  newVisibility: boolean;
  onConfirm: () => void;
  isLoading: boolean;
}

function ConfirmVisibilityModal({ 
  isOpen, 
  onClose, 
  group, 
  newVisibility, 
  onConfirm, 
  isLoading 
}: ConfirmVisibilityModalProps) {
  if (!isOpen) return null;

  const isGoingPublic = newVisibility;
  const isGoingPrivate = !newVisibility;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-50"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)' }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            {isGoingPublic ? (
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="h-6 w-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            )}
            <h3 className="text-lg font-semibold text-gray-900">
              {isGoingPublic ? 'Make Group Public' : 'Make Group Private'}
            </h3>
          </div>
          
          <div className="mb-6">
            <p className="text-gray-600 mb-4">
              {isGoingPublic 
                ? `You're about to make "${group.name}" public. This means:`
                : `You're about to make "${group.name}" private. This means:`
              }
            </p>
            
            <ul className="space-y-2 text-sm">
              {isGoingPublic ? (
                <>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">Anyone with the link can view the group</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">Integrations and feeds will be visible (but not editable)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">Authenticated users can join as viewers</span>
                  </li>
                  <li className="flex items-start gap-2 text-orange-600">
                    <svg className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <span>Member details will remain private</span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">Only group members can access the group</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">Public links will redirect to personal feed</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">New members must be invited</span>
                  </li>
                </>
              )}
            </ul>
          </div>
          
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={`flex-1 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                isGoingPublic 
                  ? 'bg-green-600 text-white hover:bg-green-700' 
                  : 'bg-orange-600 text-white hover:bg-orange-700'
              }`}
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Updating...
                </>
              ) : (
                <>
                  {isGoingPublic ? (
                    <>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Make Public
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      Make Private
                    </>
                  )}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GroupVisibilityToggle({ group, className = '' }: GroupVisibilityToggleProps) {
  const { toggleGroupVisibility } = useGroup();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingVisibility, setPendingVisibility] = useState<boolean>(false);

  const canToggle = canToggleGroupVisibility(group.role);

  if (!canToggle) {
    return null;
  }

  const handleToggleClick = (newVisibility: boolean) => {
    setPendingVisibility(newVisibility);
    setShowConfirmModal(true);
  };

  const handleConfirmToggle = async () => {
    setIsLoading(true);
    try {
      await toggleGroupVisibility(group.id, pendingVisibility);
      setShowConfirmModal(false);
    } catch (error) {
      console.error('Failed to toggle group visibility:', error);
      // Error handling can be added here (toast notification, etc.)
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className={`flex items-center gap-3 ${className}`}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Visibility:</span>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => handleToggleClick(false)}
              disabled={isLoading}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
                !group.is_public
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Private
            </button>
            <button
              onClick={() => handleToggleClick(true)}
              disabled={isLoading}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
                group.is_public
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Public
            </button>
          </div>
        </div>
      </div>

      <ConfirmVisibilityModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        group={group}
        newVisibility={pendingVisibility}
        onConfirm={handleConfirmToggle}
        isLoading={isLoading}
      />
    </>
  );
} 