import { create } from 'zustand';

interface LogEntry {
  projectId: string;
  type: string;
  message: string;
  timestamp: string;
}

interface LogStore {
  logs: LogEntry[];
  connected: boolean;
  subscribedProjectId: string | null;
  ws: WebSocket | null;
  connect: () => void;
  disconnect: () => void;
  subscribe: (projectId: string) => void;
  unsubscribe: () => void;
  clearLogs: () => void;
}

const MAX_LOGS = 500;

export const useLogStore = create<LogStore>((set, get) => ({
  logs: [],
  connected: false,
  subscribedProjectId: null,
  ws: null,

  connect: () => {
    const existing = get().ws;
    if (existing && existing.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      set({ connected: true, ws });
      // Re-subscribe if there was an active subscription
      const projectId = get().subscribedProjectId;
      if (projectId) {
        ws.send(JSON.stringify({ type: 'subscribe', projectId }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const log = JSON.parse(event.data) as LogEntry;
        set((state) => ({
          logs: [...state.logs.slice(-MAX_LOGS + 1), log],
        }));
      } catch {
        // Ignore invalid messages
      }
    };

    ws.onclose = () => {
      set({ connected: false, ws: null });
      // Auto-reconnect after 3 seconds
      setTimeout(() => {
        if (!get().ws) get().connect();
      }, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  },

  disconnect: () => {
    const ws = get().ws;
    if (ws) ws.close();
    set({ ws: null, connected: false });
  },

  subscribe: (projectId: string) => {
    set({ subscribedProjectId: projectId, logs: [] });
    const ws = get().ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe', projectId }));
    }
  },

  unsubscribe: () => {
    set({ subscribedProjectId: null });
    const ws = get().ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe', projectId: null }));
    }
  },

  clearLogs: () => set({ logs: [] }),
}));
