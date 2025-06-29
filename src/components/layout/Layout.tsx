import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useGroup } from '../../contexts/GroupContext'
import { GroupSwitcher } from '../groups/GroupSwitcher'

interface LayoutProps {
  children: ReactNode
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const { user, signOut } = useAuth();
  
  // Handle case where useGroup might be called outside provider during hot reload
  let currentGroup = null;
  let hasGroupContext = false;
  
  try {
    const groupContext = useGroup();
    currentGroup = groupContext.currentGroup;
    hasGroupContext = true;
  } catch (error) {
    // If useGroup fails (hot reload issue), continue without group context
    console.warn('GroupProvider not available, likely due to hot reload');
    hasGroupContext = false;
  }
  
  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Determine the correct paths based on current context
  const dashboardPath = currentGroup ? `/group/${currentGroup.id}` : '/';
  const updatesPath = currentGroup ? `/group/${currentGroup.id}/updates` : '/personal/updates';
  
  // Check if current path matches dashboard or updates
  const isDashboardActive = currentGroup 
    ? location.pathname === `/group/${currentGroup.id}` || location.pathname === `/group/${currentGroup.id}/`
    : location.pathname === '/' || location.pathname === '/personal';
    
  const isUpdatesActive = currentGroup
    ? location.pathname === `/group/${currentGroup.id}/updates`
    : location.pathname === '/updates' || location.pathname === '/personal/updates';
  
  return (
    <div className="min-h-screen gradient-bg">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-center py-4">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all duration-200">
                <svg className="icon-md text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  integrations.me
                </h1>
                <p className="text-sm text-gray-500 font-medium">RSS Changelog Tracker</p>
              </div>
            </Link>
            
            {/* Group Switcher - Only show if user is authenticated */}
            {user && (
              <div className="flex-1 max-w-sm mx-8">
                {/* Only render GroupSwitcher if we have group context */}
                {hasGroupContext && <GroupSwitcher />}
              </div>
            )}
            
            <div className="flex items-center gap-6">
              <nav className="flex items-center gap-4">
                <Link 
                  to={dashboardPath} 
                  className={`px-3 py-2 rounded-lg font-medium transition-all duration-200 ${
                    isDashboardActive 
                      ? 'bg-blue-100 text-blue-700 shadow-md' 
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  Dashboard
                </Link>
                <Link 
                  to={updatesPath} 
                  className={`px-3 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                    isUpdatesActive 
                      ? 'bg-blue-100 text-blue-700 shadow-md' 
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Updates
                </Link>
              </nav>

              {/* User Profile Section - Only show if user is authenticated */}
              {user ? (
                <div className="flex items-center gap-3 pl-6 border-l border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-semibold">
                        {user?.email?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-sm font-medium text-gray-900">
                        {user?.email?.split('@')[0] || 'User'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {user?.email}
                      </p>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleSignOut}
                    className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all duration-200"
                    title="Sign out"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                </div>
              ) : (
                /* Login button for non-authenticated users */
                <div className="flex items-center gap-3 pl-6 border-l border-gray-200">
                  <Link
                    to="/login"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all duration-200"
                  >
                    Sign In
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      
      <main>
        {children}
      </main>
    </div>
  )
}

export default Layout