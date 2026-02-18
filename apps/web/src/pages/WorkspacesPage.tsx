import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Box } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspace.store.js';
import { WorkspaceCard } from '../components/WorkspaceCard.js';

export function WorkspacesPage() {
  const { workspaces, isLoading, error, fetchWorkspaces } = useWorkspaceStore();

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  if (isLoading && workspaces.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Loading workspaces...
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Workspaces</h1>
          <p className="text-sm text-gray-500 mt-1">
            {workspaces.length} {workspaces.length === 1 ? 'workspace' : 'workspaces'}
          </p>
        </div>
        <Link
          to="/workspaces/new"
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200 transition-colors flex items-center gap-2"
        >
          <Plus size={16} />
          New workspace
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {workspaces.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-700 p-12 text-center">
          <Box size={40} className="mx-auto text-gray-600 mb-4" />
          <h2 className="text-lg font-medium text-gray-300 mb-2">No workspaces yet</h2>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            Create a workspace to define a Docker environment for running AI agents against your
            repositories.
          </p>
          <Link
            to="/workspaces/new"
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200 transition-colors"
          >
            Create workspace
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workspaces.map((ws) => (
            <WorkspaceCard key={ws.id} workspace={ws} />
          ))}
        </div>
      )}
    </div>
  );
}
