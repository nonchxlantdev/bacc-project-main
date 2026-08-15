import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/layout/AppShell.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import ApprovalsPage from './pages/ApprovalsPage.jsx';
import ChecklistDetailPage from './pages/ChecklistDetailPage.jsx';
import ChecklistListPage from './pages/ChecklistListPage.jsx';
import ComingSoonPage from './pages/ComingSoonPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import IncidentDetailPage from './pages/IncidentDetailPage.jsx';
import IncidentListPage from './pages/IncidentListPage.jsx';
import LocationsPage from './pages/LocationsPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import UsersPage from './pages/UsersPage.jsx';

const FieldMapperPage = import.meta.env.DEV
  ? lazy(() => import('./pages/dev/FieldMapperPage.jsx'))
  : null;

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="checklists/mine" element={<ChecklistListPage scope="mine" />} />
            <Route path="checklists/all" element={<ChecklistListPage scope="all" />} />
            <Route path="checklists/:id" element={<ChecklistDetailPage />} />
            <Route path="locations" element={<LocationsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="settings" element={<SettingsPage />} />
            {FieldMapperPage && (
              <Route
                path="dev/field-mapper"
                element={
                  <Suspense fallback={<p className="text-muted">Loading mapper…</p>}>
                    <FieldMapperPage />
                  </Suspense>
                }
              />
            )}
            <Route path="incidents" element={<IncidentListPage />} />
            <Route path="incidents/:id" element={<IncidentDetailPage />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route
              path="projects"
              element={
                <ComingSoonPage
                  title="Projects"
                  blurb="The Projects module appears in the nav and KPI cards but has no design yet. The card reads an empty repository list. Flagged for BACC — not built."
                />
              }
            />
            <Route
              path="documents"
              element={
                <ComingSoonPage
                  title="Documents"
                  blurb="Controlled document library is a later slice. Approved forms stay versioned with each checklist template."
                />
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
