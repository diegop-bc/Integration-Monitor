import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import { AuthGuard } from './components/auth/AuthGuard'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import FeedView from './pages/FeedView'
import UnifiedFeedPage from './pages/UnifiedFeedPage'
import LoginPage from './pages/LoginPage'
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
            {/* Public route - Login */}
            <Route path="/login" element={<LoginPage />} />
            
            {/* Protected routes */}
            <Route path="/*" element={
              <AuthGuard>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/feed/:feedId" element={<FeedView />} />
                    <Route path="/updates" element={<UnifiedFeedPage />} />
                  </Routes>
                </Layout>
              </AuthGuard>
            } />
          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App