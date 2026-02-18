import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { GitHubSetupPage } from './pages/GitHubSetupPage.js';
import { ImportReposPage } from './pages/ImportReposPage.js';
import { WorkspacesPage } from './pages/WorkspacesPage.js';
import { CreateWorkspacePage } from './pages/CreateWorkspacePage.js';
import { WorkspaceDetailPage } from './pages/WorkspaceDetailPage.js';
import { SessionDetailPage } from './pages/SessionDetailPage.js';

export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/workspaces" element={<WorkspacesPage />} />
          <Route path="/workspaces/new" element={<CreateWorkspacePage />} />
          <Route path="/workspaces/:id" element={<WorkspaceDetailPage />} />
          <Route path="/sessions/:id" element={<SessionDetailPage />} />
          <Route path="/settings/github" element={<GitHubSetupPage />} />
          <Route path="/import" element={<ImportReposPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
