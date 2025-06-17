import { useLocation, Link } from 'react-router-dom';

export function EmailConfirmationPage() {
  const location = useLocation();
  const { email, groupName, message } = location.state || {};

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-6">
            <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            ¡Confirma tu Email!
          </h2>
          
          <div className="text-gray-600 mb-6 space-y-3">
            <p>
              {message || 'Te hemos enviado un email de confirmación.'}
            </p>
            
            {email && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-700">
                  <strong>Email enviado a:</strong> {email}
                </p>
              </div>
            )}
            
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h3 className="font-semibold text-blue-900 mb-2">📧 Instrucciones:</h3>
              <ol className="text-sm text-blue-800 text-left space-y-1">
                <li>1. Revisa tu bandeja de entrada</li>
                <li>2. Busca el email de confirmación</li>
                <li>3. Haz click en el enlace de confirmación</li>
                <li>4. Serás redirigido automáticamente</li>
                {groupName && <li>5. Te unirás al grupo "{groupName}"</li>}
              </ol>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              ¿No ves el email? Revisa tu carpeta de spam o correo no deseado.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/login"
                className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Ir al Login
              </Link>
              
              <button
                onClick={() => window.location.reload()}
                className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Recargar Página
              </button>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-400">
              El enlace de confirmación expira en 24 horas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 