import { useEffect } from 'react';
import { Github, Check, ExternalLink, Trash2, Building2 } from 'lucide-react';
import { useGitHubStore } from '../stores/github.store.js';
import { Link, useSearchParams } from 'react-router-dom';

export function GitHubSetupPage() {
  const {
    configured,
    appSlug,
    htmlUrl,
    installations,
    isLoading,
    error,
    fetchStatus,
    fetchInstallations,
    startConnect,
    startInstall,
    disconnect,
    removeInstallation,
    clearError,
  } = useGitHubStore();

  const [searchParams] = useSearchParams();
  const setupComplete = searchParams.get('setup') === 'complete';

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (configured) {
      fetchInstallations();
    }
  }, [configured, fetchInstallations]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-white mb-2">GitHub Integration</h1>
      <p className="text-sm text-gray-500 mb-8">
        Connect Fleetwide to GitHub to discover and import your repositories.
      </p>

      {error && (
        <div className="mb-6 rounded-md border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400 flex items-center justify-between">
          {error}
          <button onClick={clearError} className="text-red-500 hover:text-red-300 text-xs ml-4">
            Dismiss
          </button>
        </div>
      )}

      {setupComplete && configured && (
        <div className="mb-6 rounded-md border border-green-800 bg-green-900/20 px-4 py-3 text-sm text-green-400 flex items-center gap-2">
          <Check size={16} />
          GitHub App created successfully! Now install it on your organization.
        </div>
      )}

      {/* Connection Status */}
      <section className="rounded-lg border border-gray-800 bg-gray-900 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`rounded-full p-2 ${configured ? 'bg-green-900/30' : 'bg-gray-800'}`}>
              <Github size={20} className={configured ? 'text-green-400' : 'text-gray-500'} />
            </div>
            <div>
              <h2 className="font-medium text-white">
                {configured ? 'Connected' : 'Not connected'}
              </h2>
              {configured && appSlug && (
                <p className="text-xs text-gray-500 mt-0.5">
                  GitHub App: <span className="text-gray-400">{appSlug}</span>
                </p>
              )}
            </div>
          </div>

          {configured ? (
            <div className="flex items-center gap-2">
              {htmlUrl && (
                <a
                  href={htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-md bg-gray-800 px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  <ExternalLink size={12} />
                  View on GitHub
                </a>
              )}
              <button
                onClick={disconnect}
                disabled={isLoading}
                className="rounded-md px-3 py-2 text-xs text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={startConnect}
              disabled={isLoading}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <Github size={16} />
              {isLoading ? 'Connecting...' : 'Connect to GitHub'}
            </button>
          )}
        </div>
      </section>

      {/* Installations */}
      {configured && (
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium text-white">Installations</h2>
            <button
              onClick={startInstall}
              disabled={isLoading}
              className="rounded-md bg-gray-800 px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <Building2 size={12} />
              Install on organization
            </button>
          </div>

          {installations.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-700 p-8 text-center">
              <Building2 size={32} className="mx-auto text-gray-600 mb-3" />
              <p className="text-sm text-gray-400 mb-1">No installations yet</p>
              <p className="text-xs text-gray-500">
                Install the GitHub App on your organization to discover repos.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {installations.map((inst) => (
                <li
                  key={inst.id}
                  className="flex items-center justify-between rounded-md border border-gray-800 bg-gray-800/50 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    {inst.accountAvatarUrl ? (
                      <img
                        src={inst.accountAvatarUrl}
                        alt={inst.accountLogin}
                        className="h-8 w-8 rounded-full"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center">
                        <Building2 size={14} className="text-gray-400" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-white">{inst.accountLogin}</p>
                      <p className="text-xs text-gray-500">
                        {inst.accountType} &middot; {inst.repositorySelection} repos
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      to="/import"
                      className="rounded-md bg-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-600 transition-colors"
                    >
                      Import repos
                    </Link>
                    <button
                      onClick={() => removeInstallation(inst.id)}
                      className="rounded-md p-1.5 text-gray-500 hover:bg-red-900/30 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
