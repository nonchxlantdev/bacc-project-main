import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/layout/AppShell.jsx';
import { DisplayPrefsProvider, useDisplayPrefs } from './context/DisplayPrefsContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { can } from './config/access.js';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';

const ApprovalsPage = lazy(() => import('./pages/ApprovalsPage.jsx'));
const ChecklistDetailPage = lazy(() => import('./pages/ChecklistDetailPage.jsx'));
const ChecklistCataloguePage = lazy(() => import('./pages/ChecklistCataloguePage.jsx'));
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const HelpPage = lazy(() => import('./pages/HelpPage.jsx'));
const IncidentDetailPage = lazy(() => import('./pages/IncidentDetailPage.jsx'));
const IncidentListPage = lazy(() => import('./pages/IncidentListPage.jsx'));
const LocationsPage = lazy(() => import('./pages/LocationsPage.jsx'));
const MyChecklistsPage = lazy(() => import('./pages/MyChecklistsPage.jsx'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage.jsx'));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));
const UsersPage = lazy(() => import('./pages/UsersPage.jsx'));

function LandingRedirect() {
  const { landingPage } = useDisplayPrefs();
  return <Navigate to={landingPage || '/dashboard'} replace />;
}

/**
 * Screens the access map does not offer this role go to the Dashboard instead
 * of opening onto a server refusal. The server still enforces the rule.
 */
function RequireScreen({ screen, children }) {
  const { profile } = useAuth();
  if (profile && !can(profile, screen)) return <Navigate to="/dashboard" replace />;
  return children;
}

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted" role="status">
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <DisplayPrefsProvider>
        <SettingsProvider>
          <AuthProvider>
            <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/" element={<AppShell />}>
                    <Route index element={<LandingRedirect />} />
                    <Route path="dashboard" element={<DashboardPage />} />
                    <Route path="checklists/mine" element={<MyChecklistsPage />} />
                    <Route path="checklists/all" element={<ChecklistCataloguePage />} />
                    <Route path="checklists/:id" element={<ChecklistDetailPage />} />
                    <Route path="locations" element={<LocationsPage />} />
                    <Route
                      path="users"
                      element={
                        <RequireScreen screen="users">
                          <UsersPage />
                        </RequireScreen>
                      }
                    />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="incidents" element={<IncidentListPage />} />
                    <Route path="incidents/:id" element={<IncidentDetailPage />} />
                    <Route path="approvals" element={<ApprovalsPage />} />
                    <Route path="notifications" element={<NotificationsPage />} />
                    <Route path="reports" element={<ReportsPage />} />
                    <Route path="help" element={<HelpPage />} />
                  </Route>
                  <Route path="*" element={<LandingRedirect />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </AuthProvider>
        </SettingsProvider>
      </DisplayPrefsProvider>
    </ThemeProvider>
  );
}
