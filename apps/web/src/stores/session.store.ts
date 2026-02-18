import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import * as api from '../services/api-client.js';

type ServerMessage =
  | { type: 'session_status'; sessionId: string; status: api.SessionStatus }
  | { type: 'session_output'; sessionId: string; stream: 'stdout' | 'stderr'; data: string }
  | { type: 'session_setup_progress'; sessionId: string; command: string; exitCode: number }
  | { type: 'session_message'; sessionId: string; message: api.SessionMessage }
  | { type: 'session_idle_warning'; sessionId: string; minutesRemaining: number }
  | { type: 'session_expired'; sessionId: string };

interface SessionState {
  sessions: api.Session[];
  current: api.Session | null;
  output: string[];
  isLoading: boolean;
  error: string | null;
  idleWarningMinutes: number | null;

  // CRUD
  fetchSessions: (filter?: { workspaceId?: string; status?: string }) => Promise<void>;
  fetchSession: (id: string) => Promise<void>;
  startSession: (data: api.StartSessionRequest) => Promise<api.Session>;
  runAgent: (sessionId: string) => Promise<void>;
  abortAgent: (sessionId: string) => Promise<void>;
  finalizeSession: (sessionId: string) => Promise<void>;
  approveSession: (sessionId: string) => Promise<void>;
  rejectSession: (sessionId: string) => Promise<void>;
  execInSession: (sessionId: string, cmd: string[]) => Promise<api.ContainerExecResult>;
  destroySession: (sessionId: string) => Promise<void>;

  // WebSocket
  subscribe: (sessionId: string) => void;
  unsubscribe: () => void;

  clearError: () => void;
}

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io('/sessions', { autoConnect: false, transports: ['websocket'] });
  }
  return socket;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  current: null,
  output: [],
  isLoading: false,
  error: null,
  idleWarningMinutes: null,

  fetchSessions: async (filter) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.getSessions(filter);
      set({ sessions: result.data, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to fetch sessions' });
    }
  },

  fetchSession: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.getSession(id);
      set({ current: result.data, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to fetch session' });
    }
  },

  startSession: async (data: api.StartSessionRequest) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.startSession(data);
      set({ isLoading: false });
      return result.data;
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to start session' });
      throw e;
    }
  },

  runAgent: async (sessionId: string) => {
    try {
      await api.runAgent(sessionId);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to run agent' });
    }
  },

  abortAgent: async (sessionId: string) => {
    try {
      await api.abortAgent(sessionId);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to abort agent' });
    }
  },

  finalizeSession: async (sessionId: string) => {
    try {
      await api.finalizeSession(sessionId);
      await get().fetchSession(sessionId);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to finalize session' });
    }
  },

  approveSession: async (sessionId: string) => {
    try {
      await api.approveSession(sessionId);
      await get().fetchSession(sessionId);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to approve session' });
    }
  },

  rejectSession: async (sessionId: string) => {
    try {
      await api.rejectSession(sessionId);
      await get().fetchSession(sessionId);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to reject session' });
    }
  },

  execInSession: async (sessionId: string, cmd: string[]) => {
    try {
      const result = await api.execInSession(sessionId, cmd);
      return result.data;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to execute command' });
      throw e;
    }
  },

  destroySession: async (sessionId: string) => {
    try {
      await api.destroySession(sessionId);
      set({ sessions: get().sessions.filter((s) => s.id !== sessionId) });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to destroy session' });
    }
  },

  subscribe: (sessionId: string) => {
    const s = getSocket();
    if (!s.connected) s.connect();

    s.emit('subscribe', { sessionId });
    set({ output: [], idleWarningMinutes: null });

    s.on('session_event', (msg: ServerMessage) => {
      if (msg.sessionId !== sessionId) return;

      switch (msg.type) {
        case 'session_status': {
          const current = get().current;
          if (current) {
            set({ current: { ...current, status: msg.status } });
          }
          break;
        }
        case 'session_output':
          set({ output: [...get().output, msg.data] });
          break;
        case 'session_message': {
          const current = get().current;
          if (current) {
            set({ current: { ...current, messages: [...current.messages, msg.message] } });
          }
          break;
        }
        case 'session_idle_warning':
          set({ idleWarningMinutes: msg.minutesRemaining });
          break;
        case 'session_expired': {
          const current = get().current;
          if (current) {
            set({ current: { ...current, status: 'expired', containerAlive: false } });
          }
          break;
        }
      }
    });
  },

  unsubscribe: () => {
    const s = getSocket();
    const current = get().current;
    if (current) {
      s.emit('unsubscribe', { sessionId: current.id });
    }
    s.off('session_event');
  },

  clearError: () => set({ error: null }),
}));
