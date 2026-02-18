import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspace.store.js';
import { useReposStore } from '../stores/repos.store.js';
import { DockerImagePicker } from '../components/DockerImagePicker.js';
import { SetupCommandEditor } from '../components/SetupCommandEditor.js';
import { EnvVarEditor } from '../components/EnvVarEditor.js';

export function CreateWorkspacePage() {
  const navigate = useNavigate();
  const { createWorkspace, isLoading, error, clearError } = useWorkspaceStore();
  const { repos, fetchRepos } = useReposStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('node:22');
  const [selectedRepoIds, setSelectedRepoIds] = useState<Set<string>>(new Set());
  const [setupCommands, setSetupCommands] = useState<string[]>([]);
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  const [memorySizeMb, setMemorySizeMb] = useState(512);
  const [cpuCount, setCpuCount] = useState(1);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  const toggleRepo = (id: string) => {
    const next = new Set(selectedRepoIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRepoIds(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    try {
      const workspace = await createWorkspace({
        name,
        description: description || undefined,
        image,
        repositoryIds: [...selectedRepoIds],
        setupCommands: setupCommands.filter((c) => c.trim()),
        environmentVariables: Object.keys(envVars).length > 0 ? envVars : undefined,
        memorySizeMb,
        cpuCount,
      });
      navigate(`/workspaces/${workspace.id}`);
    } catch {
      // error is set in the store
    }
  };

  const canSubmit = name.trim() && image.trim() && selectedRepoIds.size > 0;

  return (
    <div className="max-w-2xl">
      <button
        onClick={() => navigate('/workspaces')}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors mb-6"
      >
        <ArrowLeft size={16} />
        Back to workspaces
      </button>

      <h1 className="text-2xl font-semibold text-white mb-2">Create Workspace</h1>
      <p className="text-sm text-gray-500 mb-8">
        Define a Docker environment for running AI agents against your repositories.
      </p>

      {error && (
        <div className="mb-6 rounded-md border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Name & Description */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Frontend Development"
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-600 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Description <span className="text-gray-600">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this workspace is for..."
              rows={2}
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-600 focus:outline-none resize-none"
            />
          </div>
        </div>

        {/* Docker Image */}
        <DockerImagePicker value={image} onChange={setImage} />

        {/* Repositories */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Repositories</label>
          <p className="text-xs text-gray-500 mb-3">
            Select at least one repository to include in this workspace.
          </p>
          {repos.length === 0 ? (
            <p className="text-sm text-gray-500">
              No repositories imported yet. Import repos first.
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto rounded-lg border border-gray-800 p-2">
              {repos.map((repo) => (
                <label
                  key={repo.id}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 cursor-pointer transition-colors ${
                    selectedRepoIds.has(repo.id)
                      ? 'bg-blue-900/20 border border-blue-800'
                      : 'hover:bg-gray-800/50 border border-transparent'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedRepoIds.has(repo.id)}
                    onChange={() => toggleRepo(repo.id)}
                    className="rounded border-gray-600"
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{repo.name}</p>
                    {repo.githubFullName && (
                      <p className="text-xs text-gray-500">{repo.githubFullName}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Setup Commands */}
        <SetupCommandEditor commands={setupCommands} onChange={setSetupCommands} />

        {/* Environment Variables */}
        <EnvVarEditor variables={envVars} onChange={setEnvVars} />

        {/* Resources */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-3">Resource Limits</label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Memory (MB)</label>
              <select
                value={memorySizeMb}
                onChange={(e) => setMemorySizeMb(Number(e.target.value))}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-600 focus:outline-none"
              >
                <option value={128}>128 MB</option>
                <option value={256}>256 MB</option>
                <option value={512}>512 MB</option>
                <option value={1024}>1 GB</option>
                <option value={2048}>2 GB</option>
                <option value={4096}>4 GB</option>
                <option value={8192}>8 GB</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">CPU Count</label>
              <select
                value={cpuCount}
                onChange={(e) => setCpuCount(Number(e.target.value))}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-600 focus:outline-none"
              >
                {[1, 2, 4, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'core' : 'cores'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3 pt-4 border-t border-gray-800">
          <button
            type="submit"
            disabled={!canSubmit || isLoading}
            className="rounded-md bg-white px-6 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Creating...' : 'Create workspace'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/workspaces')}
            className="rounded-md px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
