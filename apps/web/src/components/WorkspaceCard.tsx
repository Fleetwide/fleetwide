import { Link } from 'react-router-dom';
import { Box, GitBranch, Cpu, HardDrive } from 'lucide-react';
import type { WorkspaceWithRepos } from '../services/api-client.js';

const statusStyles: Record<string, string> = {
  active: 'bg-green-900/50 text-green-400 border-green-800',
  error: 'bg-red-900/50 text-red-400 border-red-800',
  archived: 'bg-gray-800 text-gray-400 border-gray-700',
};

export function WorkspaceCard({ workspace }: { workspace: WorkspaceWithRepos }) {
  return (
    <Link
      to={`/workspaces/${workspace.id}`}
      className="block rounded-lg border border-gray-800 bg-gray-900 p-4 hover:border-gray-700 transition-colors"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <h3 className="font-medium text-white truncate">{workspace.name}</h3>
          {workspace.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{workspace.description}</p>
          )}
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs shrink-0 ml-2 ${statusStyles[workspace.status] ?? statusStyles.archived}`}
        >
          {workspace.status}
        </span>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
        <Box size={12} className="shrink-0" />
        <span className="truncate">{workspace.image}</span>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500 pt-3 border-t border-gray-800">
        <span className="flex items-center gap-1">
          <GitBranch size={12} />
          {workspace.repositories.length} {workspace.repositories.length === 1 ? 'repo' : 'repos'}
        </span>
        <span className="flex items-center gap-1">
          <Cpu size={12} />
          {workspace.cpuCount} CPU
        </span>
        <span className="flex items-center gap-1">
          <HardDrive size={12} />
          {workspace.memorySizeMb} MB
        </span>
      </div>
    </Link>
  );
}
