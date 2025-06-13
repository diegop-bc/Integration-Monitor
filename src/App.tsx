import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import FeedView from './pages/FeedView'
import UnifiedFeedPage from './pages/UnifiedFeedPage'
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
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/feed/:feedId" element={<FeedView />} />
            <Route path="/updates" element={<UnifiedFeedPage />} />
          </Routes>
        </Layout>
      </Router>
    </QueryClientProvider>
  )
}

export default App