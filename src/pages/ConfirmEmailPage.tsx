import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { memberService } from '../services/memberService';

export function ConfirmEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  // Get invitation params from URL
  const invitationToken = searchParams.get('invitation');
  const email = searchParams.get('email');

  useEffect(() => {
    const confirmEmailAndAcceptInvitation = async () => {
      try {
        // The URL will have been processed by Supabase Auth automatically
        // Check if user is now authenticated
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user) {
          throw new Error('Failed to confirm email or authenticate user');
        }

        // If we have invitation token, accept the invitation
        if (invitationToken && email) {
          try {
            await memberService.acceptInvitationExistingUser(invitationToken);
            
            // Get group info for redirect
            const invitation = await memberService.getInvitationByToken(invitationToken);
            
            setStatus('success');
            setMessage(`¡Email confirmado exitosamente! Te has unido al grupo "${invitation?.group_name}". Serás redirigido...`);
            
            // Redirect to group after short delay
            setTimeout(() => {
              navigate(invitation ? `/group/${invitation.group_id}` : '/groups', { replace: true });
            }, 3000);
          } catch (invitationError) {
            console.error('Error accepting invitation:', invitationError);
            setStatus('success');
            setMessage('¡Email confirmado exitosamente! Hubo un problema al unirte al grupo, pero puedes intentar nuevamente desde el enlace de invitación.');
            
            // Redirect to login after delay
            setTimeout(() => {
              navigate('/login', { replace: true });
            }, 5000);
          }
        } else {
          // No invitation, just email confirmation
          setStatus('success');
          setMessage('¡Email confirmado exitosamente! Puedes iniciar sesión ahora.');
          
          setTimeout(() => {
            navigate('/login', { replace: true });
          }, 3000);
        }
      } catch (error) {
        console.error('Error confirming email:', error);
        setStatus('error');
        setMessage('Error al confirmar el email. El enlace puede haber expirado.');
      }
    };

    confirmEmailAndAcceptInvitation();
  }, [invitationToken, email, navigate]);

  const getIcon = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        );
      case 'success':
        return (
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        );
      case 'error':
        return (
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100">
            <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <div className="text-center">
          <div className="mb-6">
            {getIcon()}
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {status === 'loading' && 'Confirmando Email...'}
            {status === 'success' && '¡Email Confirmado!'}
            {status === 'error' && 'Error de Confirmación'}
          </h2>
          
          <p className="text-gray-600 mb-6">
            {message || 'Procesando confirmación de email...'}
          </p>

          {status === 'error' && (
            <div className="space-y-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Intentar Nuevamente
              </button>
              
              <a
                href="/login"
                className="block text-blue-600 hover:text-blue-500 text-sm font-medium"
              >
                Ir al Login
              </a>
            </div>
          )}

          {status === 'loading' && (
            <p className="text-sm text-gray-500">
              Este proceso puede tomar unos segundos...
            </p>
          )}
        </div>
      </div>
    </div>
  );
} 