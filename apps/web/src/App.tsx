import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HealthPage } from './pages/HealthPage.js';
import { StyleguidePage } from './pages/StyleguidePage.js';
import { LoginPage } from './pages/LoginPage.js';
import { LandingPage } from './pages/LandingPage.js';
import { LeadsPage } from './pages/LeadsPage.js';
import { VisitsPage } from './pages/VisitsPage.js';
import { VisitManagePage } from './pages/VisitManagePage.js';
import { FactSheetPage } from './pages/FactSheetPage.js';
import { SlotEditorPage } from './pages/SlotEditorPage.js';
import { AdSpendPage } from './pages/AdSpendPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { BuyerChatPage } from './pages/BuyerChatPage.js';
import { HandoffsPage } from './pages/HandoffsPage.js';
import { FlaggedChatsPage } from './pages/FlaggedChatsPage.js';
import { OutboxPage } from './pages/OutboxPage.js';
import { DemoPage } from './pages/DemoPage.js';
import { ProjectShowcasePage } from './pages/ProjectShowcasePage.js';
import { PrivacyPage } from './pages/PrivacyPage.js';
import { TermsPage } from './pages/TermsPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { ToastProvider } from './components/Toast.js';
import { ServerColdStartBanner } from './components/ServerColdStartBanner.js';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import { LoadingState } from './components/LoadingState.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const RootRoute: React.FC = () => {
  const [searchParams] = useSearchParams();
  const hasSrc = Boolean(searchParams.get('src'));
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingState message="Connecting..." />;
  }

  // If navigated with attribution source (e.g. ?src=portal, ?src=meta, ?src=qr), route to Buyer Chat
  if (hasSrc) {
    return <BuyerChatPage />;
  }

  // Authenticated staff default to leads workspace
  if (user) {
    return <Navigate to="/leads" replace />;
  }

  // Direct unauthenticated visits to root land on the Landing Page
  return <LandingPage />;
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <ServerColdStartBanner />
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/" element={<RootRoute />} />
                <Route path="/landing" element={<LandingPage />} />
                <Route path="/chat" element={<BuyerChatPage />} />
                <Route path="/projects/:slug" element={<ProjectShowcasePage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route
                  path="/health"
                  element={
                    <ProtectedRoute>
                      <HealthPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/leads"
                  element={
                    <ProtectedRoute>
                      <LeadsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/visits"
                  element={
                    <ProtectedRoute>
                      <VisitsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/fact-sheet"
                  element={
                    <ProtectedRoute allowedRoles={['sales_head']}>
                      <FactSheetPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/slot-rules"
                  element={
                    <ProtectedRoute allowedRoles={['sales_head']}>
                      <SlotEditorPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/analytics"
                  element={
                    <ProtectedRoute>
                      <DashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <DashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/ad-spend"
                  element={
                    <ProtectedRoute allowedRoles={['sales_head']}>
                      <AdSpendPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/handoffs"
                  element={
                    <ProtectedRoute>
                      <HandoffsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/flagged-chats"
                  element={
                    <ProtectedRoute allowedRoles={['sales_head']}>
                      <FlaggedChatsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/outbox"
                  element={
                    <ProtectedRoute>
                      <OutboxPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/demo"
                  element={
                    <ProtectedRoute allowedRoles={['sales_head']}>
                      <DemoPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="/visit/:token" element={<VisitManagePage />} />
                <Route path="/styleguide" element={<StyleguidePage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
