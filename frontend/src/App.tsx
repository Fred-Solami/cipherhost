import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from './pages/Dashboard';
import Applications from './pages/Applications';
import AppDetail from './pages/AppDetail';
import Users from './pages/Users';
import SystemSettings from './pages/SystemSettings';
import Login from './pages/Login';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="applications" element={<Applications />} />
            <Route path="applications/:projectId" element={<AppDetail />} />
            <Route path="users" element={<Users />} />
            <Route path="settings" element={<SystemSettings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
