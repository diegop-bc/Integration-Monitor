import { useState, useEffect } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { memberService } from '../services/memberService';
import { getRedirectUrl } from '../lib/config';

type AuthMode = 'login' | 'signup';

export default function LoginPage() {
  const { user, loading, initialized } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  
  // Get invitation params
  const invitationToken = searchParams.get('invitation');
  const invitationEmail = searchParams.get('email');
  
  // Get the page the user was trying to access before login
  const from = (location.state as { from?: Location })?.from?.pathname || '/';

  // Pre-fill email if coming from invitation
  useEffect(() => {
    if (invitationEmail) {
      setEmail(invitationEmail);
    }
    // Show message from state if any (e.g., from account creation)
    if (location.state?.message) {
      setMessage(location.state.message);
      if (location.state?.email) {
        setEmail(location.state.email);
      }
    }
  }, [invitationEmail, location.state]);

  // Handle invitation after successful login
  useEffect(() => {
    const handleInvitationAfterLogin = async () => {
      if (user && invitationToken && user.email === invitationEmail) {
        try {
          await memberService.acceptInvitationExistingUser(invitationToken);
          setMessage('¡Te has unido exitosamente al grupo!');
          
          // Get the group ID from the invitation to redirect properly
          const invitation = await memberService.getInvitationByToken(invitationToken);
          const redirectUrl = invitation ? `/group/${invitation.group_id}` : '/groups';
          
          // Redirect to the specific group or groups page after a short delay
          setTimeout(() => {
            window.location.href = redirectUrl;
          }, 2000);
        } catch (err) {
          setError(`Error al unirse al grupo: ${err instanceof Error ? err.message : 'Error desconocido'}`);
        }
      }
    };

    if (user && initialized && invitationToken) {
      handleInvitationAfterLogin();
    }
  }, [user, initialized, invitationToken, invitationEmail]);

  // Redirect authenticated users (but not if they have a pending invitation)
  if (user && initialized && !invitationToken) {
    // Check if there's a redirect URL from state (from successful signup)
    const redirectUrl = location.state?.redirectAfterLogin || from;
    return <Navigate to={redirectUrl} replace />;
  }

  // Show loading while checking auth state
  if (loading || !initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    if (authMode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match');
      setIsSubmitting(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setIsSubmitting(false);
      return;
    }

    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) {
          setError(error.message);
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        
        if (error) {
          setError(error.message);
        } else {
          setMessage('Check your email for a verification link!');
        }
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setError(null);
    setMessage(null);
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div 
      className="min-h-screen flex relative"
      style={{ 
        backgroundImage: 'url(/bg-opt.webp)', 
        backgroundSize: 'cover', 
        backgroundPosition: 'center', 
        backgroundRepeat: 'no-repeat' 
      }}
    >
      {/* Left Side - Hero Section (Clear Background) */}
      <div
        className="hidden lg:flex lg:w-1/2 relative"
        style={{ 
          backdropFilter: 'blur(10px)',
          backgroundColor: 'rgba(0, 0, 0, 0.8)'
        }}
      >
        <div className="relative z-10 flex flex-col justify-center px-12 text-white" style={{ margin: "auto" }}>
          <h1 className="text-5xl font-bold mb-6 drop-shadow-lg">
            Integration Monitor
          </h1>
          <p className="text-xl mb-8 text-gray-100 drop-shadow-md">
            Monitor your integrations via RSS Feed
          </p>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center shadow-lg">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-lg drop-shadow-md">Private integration monitoring</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-lg drop-shadow-md">Secure user-specific data</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center shadow-lg">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-lg drop-shadow-md">Real-time RSS feed updates</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Auth Form with Backdrop Blur */}
      <div 
        className="flex-1 flex items-center justify-center px-6 py-12 relative"
        style={{ 
          backdropFilter: 'blur(10px)',
        }}
      >
        <div className="w-full max-w-md">
          {/* Mobile Hero */}
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2 drop-shadow-sm">
              Integration Monitor
            </h1>
            <p className="text-gray-700 drop-shadow-sm">
              Monitor your integrations via RSS Feed
            </p>
          </div>

          {/* Auth Mode Tabs */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-white/20">
            <div className="flex bg-gray-100/80 backdrop-blur-sm rounded-lg p-1 mb-8">
              <button
                onClick={() => switchMode('login')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                  authMode === 'login'
                    ? 'bg-white/90 text-gray-900 shadow-sm backdrop-blur-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => switchMode('signup')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                  authMode === 'signup'
                    ? 'bg-white/90 text-gray-900 shadow-sm backdrop-blur-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Sign Up
              </button>
            </div>

            {/* Form Header */}
            <div className="text-center mb-6">
              {invitationToken ? (
                <>
                  <h2 className="text-2xl font-bold text-gray-900">
                    Inicia Sesión para Unirte
                  </h2>
                  <p className="text-gray-700 mt-2">
                    Has sido invitado a unirte a un grupo. Inicia sesión para aceptar la invitación.
                  </p>
                  {invitationEmail && (
                    <div className="mt-3 p-3 bg-blue-50/90 backdrop-blur-sm border border-blue-200 rounded-lg">
                      <p className="text-blue-800 text-sm">
                        <strong>Email de invitación:</strong> {invitationEmail}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {authMode === 'login' ? 'Welcome back' : 'Create your account'}
                  </h2>
                  <p className="text-gray-700 mt-2">
                    {authMode === 'login' 
                      ? 'Sign in to access your private integrations'
                      : 'Start monitoring your integrations today'
                    }
                  </p>
                </>
              )}
            </div>

            {/* Error/Success Messages */}
            {error && (
              <div className="mb-4 p-3 bg-red-50/90 backdrop-blur-sm border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            {message && (
              <div className="mb-4 p-3 bg-green-50/90 backdrop-blur-sm border border-green-200 rounded-lg">
                <p className="text-green-600 text-sm">{message}</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-800 mb-1">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white/80 backdrop-blur-sm"
                  placeholder="Enter your email"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-800 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white/80 backdrop-blur-sm"
                  placeholder="Enter your password"
                  required
                  minLength={6}
                />
              </div>

              {authMode === 'signup' && (
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-800 mb-1">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white/80 backdrop-blur-sm"
                    placeholder="Confirm your password"
                    required
                    minLength={6}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue-600/90 backdrop-blur-sm text-white py-2 px-4 rounded-lg hover:bg-blue-700/90 focus:ring-4 focus:ring-blue-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all shadow-lg"
              >
                {isSubmitting ? (
                  <div className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {authMode === 'login' ? 'Signing in...' : 'Creating account...'}
                  </div>
                ) : (
                  authMode === 'login' ? 'Sign In' : 'Create Account'
                )}
              </button>
            </form>

            {/* Footer Links */}
            {authMode === 'login' && (
              <div className="mt-6 text-center">
                <button
                  onClick={() => {
                    // Handle password reset
                    if (email) {
                      supabase.auth.resetPasswordForEmail(email, {
                        redirectTo: getRedirectUrl('/reset-password'),
                      });
                      setMessage('Check your email for password reset instructions');
                    } else {
                      setError('Please enter your email address first');
                    }
                  }}
                  className="text-blue-700 hover:text-blue-600 text-sm font-medium"
                >
                  Forgot your password?
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 