import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Box,
  Cpu,
  HardDrive,
  GitBranch,
  Play,
  Trash2,
  Settings,
  ExternalLink,
} from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspace.store.js';
import { useSessionStore } from '../stores/session.store.js';
import type { SessionStatus } from '../services/api-client.js';

const sessionStatusStyles: Record<string, string> = {
  starting: 'bg-blue-900/50 text-blue-400 border-blue-800',
  setup: 'bg-blue-900/50 text-blue-400 border-blue-800',
  running: 'bg-yellow-900/50 text-yellow-400 border-yellow-800',
  finalizing: 'bg-yellow-900/50 text-yellow-400 border-yellow-800',
  preview: 'bg-purple-900/50 text-purple-400 border-purple-800',
  approved: 'bg-green-900/50 text-green-400 border-green-800',
  rejected: 'bg-red-900/50 text-red-400 border-red-800',
  completed: 'bg-green-900/50 text-green-400 border-green-800',
  failed: 'bg-red-900/50 text-red-400 border-red-800',
  expired: 'bg-gray-800 text-gray-400 border-gray-700',
};

export function WorkspaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { current: workspace, isLoading, error, fetchWorkspace, deleteWorkspace } =
    useWorkspaceStore();
  const { sessions, fetchSessions, startSession } = useSessionStore();

  const [showRunDialog, setShowRunDialog] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (id) {
      fetchWorkspace(id);
      fetchSessions({ workspaceId: id });
    }
  }, [id, fetchWorkspace, fetchSessions]);

  const handleDelete = async () => {
    if (!id || !confirm('Delete this workspace? This cannot be undone.')) return;
    await deleteWorkspace(id);
    navigate('/workspaces');
  };

  const handleRunAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !prompt.trim()) return;
    setIsStarting(true);
    try {
      const session = await startSession({ workspaceId: id, prompt });
      navigate(`/sessions/${session.id}`);
    } catch {
      setIsStarting(false);
    }
  };

  if (isLoading && !workspace) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Loading workspace...
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Workspace not found
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => navigate('/workspaces')}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors mb-6"
      >
        <ArrowLeft size={16} />
        Back to workspaces
      </button>

      {error && (
        <div className="mb-4 rounded-md border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white">{workspace.name}</h1>
          {workspace.description && (
            <p className="text-sm text-gray-500 mt-1">{workspace.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRunDialog(true)}
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200 transition-colors flex items-center gap-2"
          >
            <Play size={14} />
            Run Agent
          </button>
          <button
            onClick={handleDelete}
            className="rounded-md p-2 text-gray-500 hover:bg-red-900/30 hover:text-red-400 transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Run Agent Dialog */}
      {showRunDialog && (
        <div className="mb-6 rounded-lg border border-gray-800 bg-gray-900 p-6">
          <h3 className="text-sm font-medium text-white mb-3">Run Agent</h3>
          <form onSubmit={handleRunAgent} className="space-y-3">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the task for the agent..."
              rows={3}
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-600 focus:outline-none resize-none"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={!prompt.trim() || isStarting}
                className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {isStarting ? 'Starting...' : 'Start'}
              </button>
              <button
                type="button"
                onClick={() => setShowRunDialog(false)}
                className="rounded-md px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Details */}
        <div className="lg:col-span-1 space-y-4">
          {/* Config */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <Settings size={14} />
              Configuration
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2 text-gray-400">
                <Box size={12} className="shrink-0" />
                <span className="font-mono truncate">{workspace.image}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <Cpu size={12} className="shrink-0" />
                <span>{workspace.cpuCount} CPU</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <HardDrive size={12} className="shrink-0" />
                <span>{workspace.memorySizeMb} MB RAM</span>
              </div>
            </div>

            {workspace.setupCommands && workspace.setupCommands.length > 0 && (
              <div className="pt-2 border-t border-gray-800">
                <p className="text-xs text-gray-500 mb-1.5">Setup commands</p>
                <div className="space-y-1">
                  {workspace.setupCommands.map((cmd, i) => (
                    <code
                      key={i}
                      className="block rounded bg-gray-800 px-2 py-1 text-xs font-mono text-gray-400"
                    >
                      {cmd}
                    </code>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Repositories */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2 mb-3">
              <GitBranch size={14} />
              Repositories ({workspace.repositories.length})
            </h3>
            <div className="space-y-2">
              {workspace.repositories.map((repo) => (
                <div
                  key={repo.id}
                  className="flex items-center justify-between rounded-md bg-gray-800/50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{repo.name}</p>
                    {repo.githubFullName && (
                      <p className="text-xs text-gray-500">{repo.githubFullName}</p>
                    )}
                  </div>
                  {repo.githubHtmlUrl && (
                    <a
                      href={repo.githubHtmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-gray-300 transition-colors shrink-0 ml-2"
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Sessions */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-4">
              Sessions ({sessions.length})
            </h3>

            {sessions.length === 0 ? (
              <div className="rounded-md border border-dashed border-gray-700 p-8 text-center">
                <p className="text-sm text-gray-500 mb-1">No sessions yet</p>
                <p className="text-xs text-gray-600">
                  Run an agent to create your first session.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => (
                  <Link
                    key={session.id}
                    to={`/sessions/${session.id}`}
                    className="flex items-center justify-between rounded-md border border-gray-800 bg-gray-800/30 px-4 py-3 hover:bg-gray-800/60 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">{session.prompt}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {new Date(session.startedAt).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs shrink-0 ml-3 ${sessionStatusStyles[session.status as SessionStatus] ?? sessionStatusStyles.expired}`}
                    >
                      {session.status}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
