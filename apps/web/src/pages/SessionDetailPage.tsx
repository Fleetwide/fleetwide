import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  Square,
  CheckCircle,
  XCircle,
  Trash2,
  Terminal,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Loader2,
  Circle,
} from 'lucide-react';
import { useSessionStore } from '../stores/session.store.js';
import { SessionOutput } from '../components/SessionOutput.js';
import { SessionPreview } from '../components/SessionPreview.js';
import type { BranchInfo } from '../services/api-client.js';
import * as api from '../services/api-client.js';

const statusConfig: Record<
  string,
  { label: string; color: string; icon: typeof Circle; animate?: boolean }
> = {
  starting: { label: 'Starting', color: 'text-blue-400', icon: Loader2, animate: true },
  setup: { label: 'Setting up', color: 'text-blue-400', icon: Loader2, animate: true },
  running: { label: 'Running', color: 'text-yellow-400', icon: Loader2, animate: true },
  finalizing: { label: 'Finalizing', color: 'text-yellow-400', icon: Loader2, animate: true },
  preview: { label: 'Preview', color: 'text-purple-400', icon: Circle },
  approved: { label: 'Approved', color: 'text-green-400', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'text-red-400', icon: XCircle },
  completed: { label: 'Completed', color: 'text-green-400', icon: CheckCircle },
  failed: { label: 'Failed', color: 'text-red-400', icon: XCircle },
  expired: { label: 'Expired', color: 'text-gray-400', icon: Circle },
};

type Tab = 'conversation' | 'logs' | 'diff';

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    current: session,
    output,
    isLoading,
    error,
    idleWarningMinutes,
    fetchSession,
    runAgent,
    abortAgent,
    approveSession,
    rejectSession,
    destroySession,
    subscribe,
    unsubscribe,
    clearError,
  } = useSessionStore();

  const [activeTab, setActiveTab] = useState<Tab>('conversation');
  const [showLogs, setShowLogs] = useState(false);
  const [execCmd, setExecCmd] = useState('');
  const [execResult, setExecResult] = useState<api.ContainerExecResult | null>(null);
  const [isExecing, setIsExecing] = useState(false);
  const [branch, setBranch] = useState<BranchInfo | null>(null);

  useEffect(() => {
    if (id) {
      fetchSession(id);
      subscribe(id);
    }
    return () => {
      unsubscribe();
    };
  }, [id, fetchSession, subscribe, unsubscribe]);

  useEffect(() => {
    if (id && session && ['preview', 'approved', 'rejected', 'expired'].includes(session.status)) {
      api.getSessionBranch(id).then((r) => setBranch(r.data)).catch(() => {});
    }
  }, [id, session?.status]);

  const handleExec = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !execCmd.trim()) return;
    setIsExecing(true);
    setExecResult(null);
    try {
      const result = await api.execInSession(id, ['/bin/sh', '-c', execCmd]);
      setExecResult(result.data);
      setExecCmd('');
    } catch {
      // error shown via store
    }
    setIsExecing(false);
  };

  const handleDestroy = async () => {
    if (!id || !confirm('Destroy this session? The container will be stopped.')) return;
    await destroySession(id);
    navigate(-1);
  };

  if (isLoading && !session) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Loading session...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Session not found
      </div>
    );
  }

  const status = statusConfig[session.status] ?? statusConfig.expired;
  const StatusIcon = status.icon;

  const isActive = ['starting', 'setup', 'running', 'finalizing'].includes(session.status);
  const canApproveReject = ['preview', 'expired'].includes(session.status);
  const canExec = session.containerAlive && ['running', 'preview'].includes(session.status);
  const canRun = session.status === 'running';
  const canAbort = session.status === 'running';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b border-gray-800 pb-4 mb-4">
        <button
          onClick={() => navigate(`/workspaces/${session.workspaceId}`)}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors mb-4"
        >
          <ArrowLeft size={16} />
          Back to workspace
        </button>

        {error && (
          <div className="mb-3 rounded-md border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400 flex items-center justify-between">
            {error}
            <button onClick={clearError} className="text-red-500 hover:text-red-300 text-xs ml-4">
              Dismiss
            </button>
          </div>
        )}

        {idleWarningMinutes !== null && (
          <div className="mb-3 rounded-md border border-yellow-800 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-400 flex items-center gap-2">
            <AlertTriangle size={16} />
            Container will expire in {idleWarningMinutes} {idleWarningMinutes === 1 ? 'minute' : 'minutes'}
          </div>
        )}

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <StatusIcon
                size={16}
                className={`${status.color} ${status.animate ? 'animate-spin' : ''}`}
              />
              <span className={`text-sm font-medium ${status.color}`}>{status.label}</span>
              {session.containerAlive && (
                <span className="inline-flex items-center rounded-full bg-green-900/30 border border-green-800 px-2 py-0.5 text-xs text-green-400">
                  Container alive
                </span>
              )}
            </div>
            <p className="text-sm text-gray-300 max-w-xl">{session.prompt}</p>
            <p className="text-xs text-gray-600 mt-1">
              Started {new Date(session.startedAt).toLocaleString()}
              {session.tokenCount ? ` | ${session.tokenCount} tokens` : ''}
              {session.costUsd && Number(session.costUsd) > 0
                ? ` | $${Number(session.costUsd).toFixed(4)}`
                : ''}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canRun && (
              <button
                onClick={() => runAgent(session.id)}
                className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-200 transition-colors flex items-center gap-1.5"
              >
                <Play size={14} />
                Run
              </button>
            )}
            {canAbort && (
              <button
                onClick={() => abortAgent(session.id)}
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 transition-colors flex items-center gap-1.5"
              >
                <Square size={14} />
                Abort
              </button>
            )}
            {!isActive && (
              <button
                onClick={handleDestroy}
                className="rounded-md p-1.5 text-gray-500 hover:bg-red-900/30 hover:text-red-400 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex items-center gap-1 border-b border-gray-800 mb-4">
        {(['conversation', 'logs', 'diff'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-white text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'conversation' && (
          <>
            <SessionOutput messages={session.messages} streamOutput={output} />

            {/* Exec command */}
            {canExec && (
              <div className="shrink-0 border-t border-gray-800 pt-3 mt-3">
                <form onSubmit={handleExec} className="flex items-center gap-2">
                  <Terminal size={14} className="text-gray-500 shrink-0" />
                  <input
                    type="text"
                    value={execCmd}
                    onChange={(e) => setExecCmd(e.target.value)}
                    placeholder="Run a command in the container..."
                    className="flex-1 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-mono text-white placeholder-gray-500 focus:border-blue-600 focus:outline-none"
                    disabled={isExecing}
                  />
                  <button
                    type="submit"
                    disabled={!execCmd.trim() || isExecing}
                    className="rounded-md bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    Run
                  </button>
                </form>
                {execResult && (
                  <pre className="mt-2 rounded-md bg-gray-900 border border-gray-800 p-3 text-xs font-mono text-gray-400 max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {execResult.stdout}
                    {execResult.stderr && (
                      <span className="text-red-400">{execResult.stderr}</span>
                    )}
                    <span className="text-gray-600">
                      {'\n'}exit code: {execResult.exitCode} ({execResult.durationMs}ms)
                    </span>
                  </pre>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === 'logs' && (
          <div className="flex-1 overflow-y-auto space-y-2 p-1">
            {session.setupLogs.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-gray-600">
                No setup logs
              </div>
            ) : (
              session.setupLogs.map((log, i) => (
                <div key={i} className="rounded-lg border border-gray-800 bg-gray-900">
                  <button
                    onClick={() => setShowLogs(showLogs ? false : true)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {showLogs ? (
                        <ChevronDown size={14} className="text-gray-500 shrink-0" />
                      ) : (
                        <ChevronRight size={14} className="text-gray-500 shrink-0" />
                      )}
                      <code className="text-sm font-mono text-gray-300 truncate">{log.command}</code>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span
                        className={`text-xs ${log.exitCode === 0 ? 'text-green-400' : 'text-red-400'}`}
                      >
                        exit {log.exitCode}
                      </span>
                      <span className="text-xs text-gray-600">{log.durationMs}ms</span>
                    </div>
                  </button>
                  {showLogs && (
                    <div className="border-t border-gray-800 px-4 py-3">
                      <pre className="text-xs font-mono text-gray-400 whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {log.stdout}
                        {log.stderr && (
                          <span className="text-red-400">{log.stderr}</span>
                        )}
                      </pre>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'diff' && (
          <div className="flex-1 overflow-y-auto p-1">
            <SessionPreview
              diff={session.diffSummary}
              branch={branch}
              onApprove={() => approveSession(session.id)}
              onReject={() => rejectSession(session.id)}
              isLoading={isLoading}
              canAct={canApproveReject}
            />
          </div>
        )}
      </div>
    </div>
  );
}
