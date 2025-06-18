import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import { GroupProvider } from './contexts/GroupContext'
import { AuthGuard } from './components/auth/AuthGuard'
import { PublicGroupGuard } from './components/PublicGroupGuard'
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
            
            {/* Group routes that can be public or private */}
            <Route path="/group/:groupId" element={
              <PublicGroupGuard>
                <GroupProvider>
                  <Layout>
                    <Dashboard />
                  </Layout>
                </GroupProvider>
              </PublicGroupGuard>
            } />
            
            <Route path="/group/:groupId/feed/:feedId" element={
              <PublicGroupGuard>
                <GroupProvider>
                  <Layout>
                    <FeedView />
                  </Layout>
                </GroupProvider>
              </PublicGroupGuard>
            } />
            
            <Route path="/group/:groupId/updates" element={
              <PublicGroupGuard>
                <GroupProvider>
                  <Layout>
                    <UnifiedFeedPage />
                  </Layout>
                </GroupProvider>
              </PublicGroupGuard>
            } />
            
            {/* Protected personal routes */}
            <Route path="/" element={
              <AuthGuard>
                <GroupProvider>
                  <Layout>
                    <Dashboard />
                  </Layout>
                </GroupProvider>
              </AuthGuard>
            } />
            
            <Route path="/personal" element={
              <AuthGuard>
                <GroupProvider>
                  <Layout>
                    <Dashboard />
                  </Layout>
                </GroupProvider>
              </AuthGuard>
            } />
            
            <Route path="/personal/feed/:feedId" element={
              <AuthGuard>
                <GroupProvider>
                  <Layout>
                    <FeedView />
                  </Layout>
                </GroupProvider>
              </AuthGuard>
            } />
            
            <Route path="/personal/updates" element={
              <AuthGuard>
                <GroupProvider>
                  <Layout>
                    <UnifiedFeedPage />
                  </Layout>
                </GroupProvider>
              </AuthGuard>
            } />
            
            {/* Legacy routes for backward compatibility */}
            <Route path="/feed/:feedId" element={
              <AuthGuard>
                <GroupProvider>
                  <Layout>
                    <FeedView />
                  </Layout>
                </GroupProvider>
              </AuthGuard>
            } />
            
            <Route path="/updates" element={
              <AuthGuard>
                <GroupProvider>
                  <Layout>
                    <UnifiedFeedPage />
                  </Layout>
                </GroupProvider>
              </AuthGuard>
            } />
          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App