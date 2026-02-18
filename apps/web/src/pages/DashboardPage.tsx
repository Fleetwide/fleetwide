import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { GitBranch, Github, RefreshCw, Trash2, ExternalLink } from 'lucide-react';
import { useReposStore } from '../stores/repos.store.js';
import type { Repository } from '../services/api-client.js';

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    synced: 'bg-green-900/50 text-green-400 border-green-800',
    syncing: 'bg-blue-900/50 text-blue-400 border-blue-800',
    error: 'bg-red-900/50 text-red-400 border-red-800',
    uninitialized: 'bg-gray-800 text-gray-400 border-gray-700',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${styles[status] ?? styles.uninitialized}`}>
      {status}
    </span>
  );
}

function RepoCard({ repo, onSync, onDelete }: { repo: Repository; onSync: () => void; onDelete: () => void }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-white truncate">{repo.name}</h3>
            {repo.source === 'github' && (
              <Github size={14} className="shrink-0 text-gray-500" />
            )}
          </div>
          {repo.githubFullName && (
            <p className="text-xs text-gray-500 mt-0.5">{repo.githubFullName}</p>
          )}
        </div>
        {statusBadge(repo.status)}
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <GitBranch size={12} />
          {repo.defaultBranch}
        </span>
        {repo.githubPrivate && (
          <span className="rounded border border-gray-700 px-1.5 py-0.5">private</span>
        )}
      </div>

      <div className="flex items-center gap-2 mt-auto pt-2 border-t border-gray-800">
        <button
          onClick={onSync}
          disabled={repo.status === 'syncing'}
          className="flex items-center gap-1.5 rounded-md bg-gray-800 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={repo.status === 'syncing' ? 'animate-spin' : ''} />
          Sync
        </button>
        {repo.githubHtmlUrl && (
          <a
            href={repo.githubHtmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-md bg-gray-800 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          >
            <ExternalLink size={12} />
            GitHub
          </a>
        )}
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-gray-500 hover:bg-red-900/30 hover:text-red-400 transition-colors ml-auto"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { repos, isLoading, error, fetchRepos, syncRepo, deleteRepo } = useReposStore();

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  if (isLoading && repos.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Loading repositories...
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Repositories</h1>
          <p className="text-sm text-gray-500 mt-1">
            {repos.length} {repos.length === 1 ? 'repository' : 'repositories'} imported
          </p>
        </div>
        <Link
          to="/import"
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200 transition-colors"
        >
          Import repos
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {repos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-700 p-12 text-center">
          <Github size={40} className="mx-auto text-gray-600 mb-4" />
          <h2 className="text-lg font-medium text-gray-300 mb-2">No repositories yet</h2>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            Connect your GitHub account and import repositories to get started.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              to="/settings/github"
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200 transition-colors"
            >
              Connect to GitHub
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {repos.map((repo) => (
            <RepoCard
              key={repo.id}
              repo={repo}
              onSync={() => syncRepo(repo.id)}
              onDelete={() => deleteRepo(repo.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
