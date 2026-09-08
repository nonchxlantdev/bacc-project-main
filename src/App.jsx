import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/layout/AppShell.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { DisplayPrefsProvider, useDisplayPrefs } from './context/DisplayPrefsContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import ApprovalsPage from './pages/ApprovalsPage.jsx';
import ChecklistDetailPage from './pages/ChecklistDetailPage.jsx';
import ChecklistCataloguePage from './pages/ChecklistCataloguePage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import HelpPage from './pages/HelpPage.jsx';
import IncidentDetailPage from './pages/IncidentDetailPage.jsx';
import IncidentListPage from './pages/IncidentListPage.jsx';
import LocationsPage from './pages/LocationsPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import MyChecklistsPage from './pages/MyChecklistsPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import UsersPage from './pages/UsersPage.jsx';

function LandingRedirect() {
  const { landingPage } = useDisplayPrefs();
  return <Navigate to={landingPage || '/dashboard'} replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <DisplayPrefsProvider>
        <SettingsProvider>
          <AuthProvider>
            <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/" element={<AppShell />}>
                  <Route index element={<LandingRedirect />} />
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route path="checklists/mine" element={<MyChecklistsPage />} />
                  <Route path="checklists/all" element={<ChecklistCataloguePage />} />
                  <Route path="checklists/:id" element={<ChecklistDetailPage />} />
                  <Route path="locations" element={<LocationsPage />} />
                  <Route path="users" element={<UsersPage />} />
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
            </BrowserRouter>
          </AuthProvider>
        </SettingsProvider>
      </DisplayPrefsProvider>
    </ThemeProvider>
  );
}
