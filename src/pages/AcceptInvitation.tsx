import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { memberService } from '../services/memberService';
import { useAuth } from '../contexts/AuthContext';
import { getRoleDisplayName } from '../utils/permissions';
import type { GroupInvitation, AcceptInvitationRequest } from '../types/group';

export function AcceptInvitation() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [invitation, setInvitation] = useState<GroupInvitation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExistingUser, setIsExistingUser] = useState<boolean | null>(null);
  const [formData, setFormData] = useState({
    email: searchParams.get('email') || '',
    password: '',
    name: '',
  });

  // Function to check if email is already registered
  const checkEmailExists = async (email: string): Promise<boolean> => {
    try {
      return await memberService.checkEmailExists(email);
    } catch (error) {
      console.error('Error checking email existence:', error);
      return false;
    }
  };

  useEffect(() => {
    if (!token) {
      setError('Invalid invitation link');
      setIsLoading(false);
      return;
    }

    // Fetch invitation details
    const fetchInvitation = async () => {
      try {
        const invitationData = await memberService.getInvitationByToken(token);
        if (!invitationData) {
          setError('Invitation invalid or expired');
        } else if (invitationData.is_expired) {
          setError('This invitation has expired. Please request a new invitation from the group owner.');
        } else {
          setInvitation(invitationData);
          setFormData(prev => ({ ...prev, email: invitationData.invited_email }));
          
          // Check if user is already logged in with the invited email
          if (user && user.email === invitationData.invited_email) {
            setIsExistingUser(true);
          } else if (user && user.email !== invitationData.invited_email) {
            setError('You are logged in with a different account. Please log out and try again with the correct email.');
          } else {
            // Check if the invited email is already registered
            const emailExists = await checkEmailExists(invitationData.invited_email);
            setIsExistingUser(emailExists);
          }
        }
      } catch (err) {
        console.error('Failed to fetch invitation:', err);
        setError('Error al cargar los detalles de la invitación');
      } finally {
        setIsLoading(false);
      }
    };

    fetchInvitation();
  }, [token, user]);

  const handleAcceptForExistingUser = async () => {
    if (!invitation || !user) return;
    
    setIsSubmitting(true);
    setError(null);

    try {
      await memberService.acceptInvitationExistingUser(token!);
      navigate(`/group/${invitation.group_id}`, { 
        replace: true,
        state: { message: `You have successfully joined the group "${invitation.group_name}"!` }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aceptar la invitación');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const acceptData: AcceptInvitationRequest = {
        token: token!,
        email: formData.email,
        password: formData.password,
        name: formData.name,
      };

      await memberService.acceptInvitation(acceptData);
      
      // Show email confirmation message instead of redirecting to login
      navigate('/email-confirmation', { 
        replace: true,
        state: { 
          email: formData.email,
          groupName: invitation.group_name,
          message: `¡Cuenta creada exitosamente! Revisa tu email (${formData.email}) para confirmar tu cuenta. Después de confirmar, serás automáticamente agregado al grupo "${invitation.group_name}".`
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aceptar la invitación');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Cargando invitación...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Invitation Error</h3>
            <p className="text-sm text-gray-500 mb-6">{error}</p>
            <Link
              to="/login"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!invitation) {
    return null;
  }

  // Show accept button for existing users
  if (isExistingUser && user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mb-4">
              <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Join the Team</h2>
            <p className="text-gray-600 mb-6">
              You have been invited to join the group <strong>{invitation.group_name}</strong> as {getRoleDisplayName(invitation.role)}.
            </p>
            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              <p className="text-sm text-gray-700">
                <strong>Group:</strong> {invitation.group_name}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Role:</strong> {getRoleDisplayName(invitation.role)}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Invited by:</strong> {invitation.invited_by_name}
              </p>
            </div>
            <button
              onClick={handleAcceptForExistingUser}
              disabled={isSubmitting}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isSubmitting ? 'Joining...' : 'Join Group'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show login prompt if user exists but not logged in
  if (isExistingUser && !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Found!</h2>
            <p className="text-gray-600 mb-6">
              You already have an account with email <strong>{invitation.invited_email}</strong>. 
              Please sign in to join the group <strong>{invitation.group_name}</strong>.
            </p>
            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              <p className="text-sm text-gray-700">
                <strong>Group:</strong> {invitation.group_name}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Role:</strong> {getRoleDisplayName(invitation.role)}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Invited by:</strong> {invitation.invited_by_name}
              </p>
            </div>
            <Link
              to={`/login?invitation=${token}&email=${encodeURIComponent(invitation.invited_email)}`}
              className="w-full inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Sign in to Join
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Show signup form for new users
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <div className="text-center mb-6">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mb-4">
            <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Create Account</h2>
          <p className="text-gray-600">
            Create your account to join the group <strong>{invitation.group_name}</strong> as {getRoleDisplayName(invitation.role)}.
          </p>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <p className="text-sm text-gray-700">
            <strong>Group:</strong> {invitation.group_name}
          </p>
          <p className="text-sm text-gray-700">
            <strong>Role:</strong> {getRoleDisplayName(invitation.role)}
          </p>
          <p className="text-sm text-gray-700">
            <strong>Invited by:</strong> {invitation.invited_by_name}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={formData.email}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-500 cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isSubmitting ? 'Creating account...' : 'Create Account and Join'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Already have an account?{' '}
            <Link 
              to={`/login?invitation=${token}&email=${encodeURIComponent(formData.email)}`}
              className="font-medium text-blue-600 hover:text-blue-500"
            >
              Sign in to join
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
} 