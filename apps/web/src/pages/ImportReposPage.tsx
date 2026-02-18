import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Check, Github, Lock, Search, Loader2 } from 'lucide-react';
import { useGitHubStore } from '../stores/github.store.js';
import type { DiscoveredRepo, ImportResult } from '../services/api-client.js';

export function ImportReposPage() {
  const {
    configured,
    installations,
    discoveredRepos,
    isLoading,
    error,
    fetchStatus,
    fetchInstallations,
    discoverRepos,
    importRepos,
    clearError,
  } = useGitHubStore();

  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (configured) {
      fetchInstallations();
      discoverRepos();
    }
  }, [configured, fetchInstallations, discoverRepos]);

  if (!configured) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold text-white mb-6">Import Repositories</h1>
        <div className="rounded-lg border border-dashed border-gray-700 p-12 text-center">
          <Github size={40} className="mx-auto text-gray-600 mb-4" />
          <h2 className="text-lg font-medium text-gray-300 mb-2">Connect GitHub first</h2>
          <p className="text-sm text-gray-500 mb-6">
            You need to connect your GitHub account before importing repositories.
          </p>
          <Link
            to="/settings/github"
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200 transition-colors"
          >
            Go to GitHub settings
          </Link>
        </div>
      </div>
    );
  }

  const filteredRepos = discoveredRepos.filter((repo) =>
    repo.fullName.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleRepo = (githubId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(githubId)) {
        next.delete(githubId);
      } else {
        next.add(githubId);
      }
      return next;
    });
  };

  const selectAll = () => {
    const importable = filteredRepos.filter((r) => !r.alreadyImported).map((r) => r.githubId);
    setSelected(new Set(importable));
  };

  const deselectAll = () => setSelected(new Set());

  const handleImport = async () => {
    if (selected.size === 0 || installations.length === 0) return;
    setIsImporting(true);
    const repos = discoveredRepos.filter((r) => selected.has(r.githubId));
    const importResults = await importRepos(installations[0]!.installationId, repos);
    setResults(importResults);
    setIsImporting(false);
  };

  if (results) {
    const succeeded = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'error').length;
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold text-white mb-6">Import Complete</h1>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Check size={20} className="text-green-400" />
            <p className="text-sm text-white">
              {succeeded} {succeeded === 1 ? 'repository' : 'repositories'} imported successfully
              {failed > 0 && <span className="text-red-400"> ({failed} failed)</span>}
            </p>
          </div>
          <ul className="space-y-2">
            {results.map((r) => (
              <li
                key={r.githubId}
                className="flex items-center justify-between rounded-md bg-gray-800/50 px-3 py-2 text-sm"
              >
                <span className="text-gray-300">{r.fullName}</span>
                {r.status === 'success' ? (
                  <span className="text-green-400 text-xs">Imported</span>
                ) : (
                  <span className="text-red-400 text-xs" title={r.error}>
                    Failed
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <button
          onClick={() => navigate('/')}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200 transition-colors"
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Import Repositories</h1>
          <p className="text-sm text-gray-500 mt-1">
            Select repositories to import from your GitHub installations.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400 flex items-center justify-between">
          {error}
          <button onClick={clearError} className="text-red-500 hover:text-red-300 text-xs ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Search & Actions */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search repositories..."
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            className="w-full rounded-md border border-gray-700 bg-gray-800 pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
          />
        </div>
        <button
          onClick={selected.size > 0 ? deselectAll : selectAll}
          className="rounded-md bg-gray-800 px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 transition-colors shrink-0"
        >
          {selected.size > 0 ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      {/* Repo List */}
      {isLoading && discoveredRepos.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-500 gap-2">
          <Loader2 size={16} className="animate-spin" />
          Discovering repositories...
        </div>
      ) : (
        <div className="rounded-lg border border-gray-800 bg-gray-900 divide-y divide-gray-800 mb-6">
          {filteredRepos.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              {search ? 'No repositories match your search.' : 'No repositories found.'}
            </div>
          ) : (
            filteredRepos.map((repo) => (
              <label
                key={repo.githubId}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                  repo.alreadyImported
                    ? 'opacity-50 cursor-default'
                    : selected.has(repo.githubId)
                      ? 'bg-gray-800/50'
                      : 'hover:bg-gray-800/30'
                }`}
              >
                <input
                  type="checkbox"
                  checked={repo.alreadyImported || selected.has(repo.githubId)}
                  disabled={repo.alreadyImported}
                  onChange={() => toggleRepo(repo.githubId)}
                  className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-white accent-white"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white truncate">{repo.fullName}</span>
                    {repo.private && <Lock size={12} className="shrink-0 text-gray-500" />}
                    {repo.alreadyImported && (
                      <span className="text-xs text-gray-500 bg-gray-800 rounded px-1.5 py-0.5">
                        imported
                      </span>
                    )}
                  </div>
                  {repo.description && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">{repo.description}</p>
                  )}
                </div>
                {repo.language && (
                  <span className="text-xs text-gray-500 shrink-0">{repo.language}</span>
                )}
              </label>
            ))
          )}
        </div>
      )}

      {/* Import Button */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {selected.size} {selected.size === 1 ? 'repository' : 'repositories'} selected
        </p>
        <button
          onClick={handleImport}
          disabled={selected.size === 0 || isImporting}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isImporting && <Loader2 size={14} className="animate-spin" />}
          {isImporting ? 'Importing...' : `Import ${selected.size || ''} repos`}
        </button>
      </div>
    </div>
  );
}
