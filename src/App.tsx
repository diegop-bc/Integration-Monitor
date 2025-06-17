import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import { GroupProvider } from './contexts/GroupContext'
import { AuthGuard } from './components/auth/AuthGuard'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import FeedView from './pages/FeedView'
import UnifiedFeedPage from './pages/UnifiedFeedPage'
import LoginPage from './pages/LoginPage'
import { AcceptInvitation } from './pages/AcceptInvitation'
import { EmailConfirmationPage } from './pages/EmailConfirmationPage'
import { ConfirmEmailPage } from './pages/ConfirmEmailPage'
import './App.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 2,
    },
  },
})

// Protected routes wrapper component
function ProtectedRoutes() {
  return (
    <GroupProvider>
      <Layout>
        <Routes>
          {/* Personal workspace routes */}
          <Route path="/" element={<Dashboard />} />
          <Route path="/personal" element={<Dashboard />} />
          <Route path="/personal/feed/:feedId" element={<FeedView />} />
          <Route path="/personal/updates" element={<UnifiedFeedPage />} />
          
          {/* Group workspace routes */}
          <Route path="/group/:groupId" element={<Dashboard />} />
          <Route path="/group/:groupId/feed/:feedId" element={<FeedView />} />
          <Route path="/group/:groupId/updates" element={<UnifiedFeedPage />} />
          
          {/* Legacy routes for backward compatibility */}
          <Route path="/feed/:feedId" element={<FeedView />} />
          <Route path="/updates" element={<UnifiedFeedPage />} />
        </Routes>
      </Layout>
    </GroupProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/invite/:token" element={<AcceptInvitation />} />
            <Route path="/email-confirmation" element={<EmailConfirmationPage />} />
            <Route path="/confirm-email" element={<ConfirmEmailPage />} />
            
            {/* Protected routes */}
            <Route path="/*" element={
              <AuthGuard>
                <ProtectedRoutes />
              </AuthGuard>
            } />
          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App