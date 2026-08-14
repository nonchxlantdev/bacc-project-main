import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/layout/AppShell.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import ChecklistDetailPage from './pages/ChecklistDetailPage.jsx';
import ChecklistListPage from './pages/ChecklistListPage.jsx';
import ComingSoonPage from './pages/ComingSoonPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import LocationsPage from './pages/LocationsPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import UsersPage from './pages/UsersPage.jsx';

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
            <Route
              path="incidents"
              element={
                <ComingSoonPage
                  title="Incidents"
                  blurb="Incident creation from NO-SAT items is Phase 2. The control is visible on the checklist but disabled."
                />
              }
            />
            <Route
              path="reports"
              element={<ComingSoonPage title="Reports" blurb="Operational reports land in Phase 3." />}
            />
            <Route
              path="documents"
              element={<ComingSoonPage title="Documents" blurb="The document library lands in Phase 3." />}
            />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
