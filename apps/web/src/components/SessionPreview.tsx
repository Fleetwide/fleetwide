import { FileText, FilePlus, FileX, FilePen } from 'lucide-react';
import type { DiffSummary, BranchInfo } from '../services/api-client.js';

const fileStatusIcons = {
  added: FilePlus,
  modified: FilePen,
  deleted: FileX,
  renamed: FileText,
};

const fileStatusColors = {
  added: 'text-green-400',
  modified: 'text-yellow-400',
  deleted: 'text-red-400',
  renamed: 'text-blue-400',
};

export function SessionPreview({
  diff,
  branch,
  onApprove,
  onReject,
  isLoading,
  canAct,
}: {
  diff: DiffSummary | null;
  branch: BranchInfo | null;
  onApprove: () => void;
  onReject: () => void;
  isLoading: boolean;
  canAct: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Branch info */}
      {branch?.branchName && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-2">Branch</h3>
          <code className="block rounded bg-gray-800 px-3 py-2 text-sm font-mono text-gray-300">
            {branch.branchName}
          </code>
          {branch.checkoutCommand && (
            <p className="mt-2 text-xs text-gray-500">
              Preview locally:{' '}
              <code className="rounded bg-gray-800 px-1.5 py-0.5 font-mono text-gray-400">
                {branch.checkoutCommand}
              </code>
            </p>
          )}
          {branch.prUrl && (
            <a
              href={branch.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-xs text-blue-400 hover:text-blue-300"
            >
              View PR #{branch.prNumber}
            </a>
          )}
        </div>
      )}

      {/* Diff summary */}
      {diff && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-300">Changes</h3>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-gray-500">{diff.filesChanged} files</span>
              <span className="text-green-400">+{diff.insertions}</span>
              <span className="text-red-400">-{diff.deletions}</span>
            </div>
          </div>

          <div className="space-y-1">
            {diff.files.map((file, i) => {
              const Icon = fileStatusIcons[file.status];
              const color = fileStatusColors[file.status];
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-gray-800/50"
                >
                  <Icon size={14} className={`shrink-0 ${color}`} />
                  <span className="text-gray-500 shrink-0">{file.repoName}/</span>
                  <span className="text-gray-300 truncate">{file.path}</span>
                  <span className="ml-auto text-green-400 shrink-0">+{file.insertions}</span>
                  <span className="text-red-400 shrink-0">-{file.deletions}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!diff && (
        <div className="rounded-lg border border-dashed border-gray-700 p-8 text-center">
          <p className="text-sm text-gray-500">No changes detected</p>
        </div>
      )}

      {/* Actions */}
      {canAct && (
        <div className="flex items-center gap-3">
          <button
            onClick={onApprove}
            disabled={isLoading}
            className="flex-1 rounded-md bg-green-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-600 transition-colors disabled:opacity-50"
          >
            Approve & Create PR
          </button>
          <button
            onClick={onReject}
            disabled={isLoading}
            className="flex-1 rounded-md border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
