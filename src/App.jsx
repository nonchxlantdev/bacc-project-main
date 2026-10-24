import { Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { lazyWithReload } from './lib/lazyWithReload.js';
import PortalUpdateNotice from './components/PortalUpdateNotice.jsx';
import AppShell from './components/layout/AppShell.jsx';
import { DisplayPrefsProvider, useDisplayPrefs } from './context/DisplayPrefsContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { can } from './config/access.js';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';

const ApprovalsPage = lazyWithReload('approvals', () => import('./pages/ApprovalsPage.jsx'));
const ChecklistDetailPage = lazyWithReload('checklist-detail', () => import('./pages/ChecklistDetailPage.jsx'));
const ChecklistCataloguePage = lazyWithReload('checklists-all', () => import('./pages/ChecklistCataloguePage.jsx'));
const DashboardPage = lazyWithReload('dashboard', () => import('./pages/DashboardPage.jsx'));
const HelpPage = lazyWithReload('help', () => import('./pages/HelpPage.jsx'));
const IncidentDetailPage = lazyWithReload('incident-detail', () => import('./pages/IncidentDetailPage.jsx'));
const IncidentListPage = lazyWithReload('incidents', () => import('./pages/IncidentListPage.jsx'));
const LocationsPage = lazyWithReload('locations', () => import('./pages/LocationsPage.jsx'));
const MyChecklistsPage = lazyWithReload('checklists-mine', () => import('./pages/MyChecklistsPage.jsx'));
const NotificationsPage = lazyWithReload('notifications', () => import('./pages/NotificationsPage.jsx'));
const ReportsPage = lazyWithReload('reports', () => import('./pages/ReportsPage.jsx'));
const SettingsPage = lazyWithReload('settings', () => import('./pages/SettingsPage.jsx'));
const UsersPage = lazyWithReload('users', () => import('./pages/UsersPage.jsx'));

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
      <PortalUpdateNotice />
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
