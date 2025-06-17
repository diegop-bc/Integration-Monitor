import React, { useState } from 'react';
import { memberService } from '../../services/memberService';
import { getAssignableRoles, getRoleDisplayName } from '../../utils/permissions';
import type { GroupRole, InviteMemberRequest } from '../../types/group';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  userRole: GroupRole;
  onInviteSuccess?: () => void;
}

export function InviteMemberModal({ 
  isOpen, 
  onClose, 
  groupId, 
  userRole,
  onInviteSuccess 
}: InviteMemberModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailsInput, setEmailsInput] = useState('');
  const [useMultipleEmails, setUseMultipleEmails] = useState(false);

  const assignableRoles = getAssignableRoles(userRole);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (useMultipleEmails) {
        // Handle bulk invitations
        const emails = emailsInput
          .split(/[,\n]/)
          .map(email => email.trim())
          .filter(email => email.length > 0);

        if (emails.length === 0) {
          setError('Please enter at least one email address');
          setIsLoading(false);
          return;
        }

        // Validate all emails
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const invalidEmails = emails.filter(email => !emailRegex.test(email));
        
        if (invalidEmails.length > 0) {
          setError(`Invalid email addresses: ${invalidEmails.join(', ')}`);
          setIsLoading(false);
          return;
        }

        // Send invitations for all emails
        const invitePromises = emails.map(email => 
          memberService.inviteMember(groupId, { email, role })
        );

        await Promise.all(invitePromises);
        
        // Reset form
        setEmailsInput('');
        setRole('member');
        
        onInviteSuccess?.();
        onClose();
      } else {
        // Handle single invitation
        if (!email.trim()) {
          setError('Email is required');
          setIsLoading(false);
          return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          setError('Please enter a valid email address');
          setIsLoading(false);
          return;
        }

        const inviteData: InviteMemberRequest = {
          email: email.trim(),
          role
        };

        await memberService.inviteMember(groupId, inviteData);
        
        // Reset form
        setEmail('');
        setRole('member');
        
        onInviteSuccess?.();
        onClose();
      }
    } catch (err) {
      console.error('Failed to invite member:', err);
      setError(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setEmail('');
      setEmailsInput('');
      setRole('member');
      setError(null);
      setUseMultipleEmails(false);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-50"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)' }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            <h2 className="text-xl font-semibold text-gray-900">Invite Members</h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Bulk invite toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="bulk-invite"
              checked={useMultipleEmails}
              onChange={(e) => setUseMultipleEmails(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="bulk-invite" className="text-sm text-gray-700">
              Invite multiple people at once
            </label>
          </div>

          {/* Email input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {useMultipleEmails ? 'Email Addresses' : 'Email Address'}
            </label>
            {useMultipleEmails ? (
              <div>
                <textarea
                  value={emailsInput}
                  onChange={(e) => setEmailsInput(e.target.value)}
                  placeholder="Enter email addresses separated by commas or new lines&#10;example@company.com, user@domain.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={4}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Separate email addresses with commas or new lines
                </p>
              </div>
            ) : (
              <div className="relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
            )}
          </div>

          {/* Role selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'member' | 'viewer')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {assignableRoles.map((roleOption) => (
                <option key={roleOption} value={roleOption}>
                  {getRoleDisplayName(roleOption)}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {role === 'admin' && 'Can manage members and group settings'}
              {role === 'member' && 'Can view and manage integrations'}
              {role === 'viewer' && 'Can only view group content'}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Sending...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  {useMultipleEmails ? 'Send Invitations' : 'Send Invitation'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 