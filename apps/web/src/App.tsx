import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { GitHubSetupPage } from './pages/GitHubSetupPage.js';
import { ImportReposPage } from './pages/ImportReposPage.js';

export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/settings/github" element={<GitHubSetupPage />} />
          <Route path="/import" element={<ImportReposPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
