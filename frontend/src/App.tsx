import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { inactivityService } from '@/services/inactivityService';
import { LoginPage } from '@/pages/LoginPage';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ScrapersPage } from '@/components/dashboard/ScrapersPage';
import { DataPage } from '@/components/dashboard/DataPage';
import { StatisticsPage } from '@/components/statistics/StatisticsPage';
import { ParametersPage } from '@/components/settings/ParametersPage';
import { authService } from '@/services/authService';

function App() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });

  useEffect(() => {
    // Initialize authentication state
    authService.initializeAuth();
    
    // Start inactivity timer if user is authenticated
    if (authService.isAuthenticated()) {
      inactivityService.startTimer();
    }

    // Cleanup on unmount
    return () => {
      inactivityService.stopTimer();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
        <Route path="/data" element={
          <ProtectedRoute>
            <DashboardLayout>
              <DataPage />
            </DashboardLayout>
          </ProtectedRoute>
        } />
        <Route path="/statistics" element={
          <ProtectedRoute>
            <DashboardLayout>
              <StatisticsPage />
            </DashboardLayout>
          </ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute>
            <DashboardLayout>
              <ParametersPage />
            </DashboardLayout>
          </ProtectedRoute>
        } />
        
        {/* Redirect root to dashboard if authenticated, otherwise to login */}
        <Route path="/" element={
          authService.isAuthenticated() ? 
            <Navigate to="/dashboard" replace /> : 
            <Navigate to="/login" replace />
        } />
      </Routes>
      <Toaster />
    </Router>
  );
}

export default App;
