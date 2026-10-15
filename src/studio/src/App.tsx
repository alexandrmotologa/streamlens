import React, { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar.js';
import { MetricsSummary } from './components/MetricsSummary.js';
import { TokenWaterfall } from './components/TokenWaterfall.js';
import { EventStreamTable } from './components/EventStreamTable.js';
import { ToolCallViewer } from './components/ToolCallViewer.js';
import { ChaosControls } from './components/ChaosControls.js';
import { MockGeneratorModal } from './components/MockGeneratorModal.js';
import { StreamSession, ChaosConfig, SSEMessage, StreamingToolCall } from '../../core/types.js';
import { Activity, Wrench, List, FileText } from 'lucide-react';

export const App: React.FC = () => {
  const [connected, setConnected] = useState(false);
  const [sessions, setSessions] = useState<Array<{ sessionId: string; path: string; totalTokens: number; startTime: number }>>([]);
  const [activeSession, setActiveSession] = useState<StreamSession | null>(null);
  const [activeTab, setActiveTab] = useState<'waterfall' | 'toolcalls' | 'events' | 'text'>('waterfall');
  const [chaosModalOpen, setChaosModalOpen] = useState(false);
  const [mockModalOpen, setMockModalOpen] = useState(false);
  const [chaosConfig, setChaosConfig] = useState<ChaosConfig>({
    enabled: false,
    bufferThresholdBytes: 4096,
    minJitterMs: 0,
    maxJitterMs: 0
  });

  const wsRef = useRef<WebSocket | null>(null);
  const activeSessionRef = useRef<StreamSession | null>(null);
  activeSessionRef.current = activeSession;

  // 1. Initial Load: Fetch sessions and chaos config
  useEffect(() => {
    fetch('/api/sessions')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setSessions(data);
        if (data.length > 0) {
          fetchSessionDetail(data[0].sessionId);
        }
      })
      .catch(() => {});

    fetch('/api/chaos')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setChaosConfig(data);
      })
      .catch(() => {});
  }, []);

  const fetchSessionDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (res.ok) {
        const full = await res.json();
        setActiveSession(full);
      }
    } catch {
      // Ignore
    }
  };

  // 2. Real-time WebSocket connection
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          handleWebSocketMessage(payload);
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectTimer = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleWebSocketMessage = (payload: {
    type: string;
    session?: Partial<StreamSession>;
    message?: SSEMessage;
    toolCall?: StreamingToolCall;
  }) => {
    const current = activeSessionRef.current;

    if (payload.type === 'session_start' && payload.session) {
      const newSess = payload.session as StreamSession;
      setActiveSession(newSess);
      setSessions((prev) => [
        {
          sessionId: newSess.sessionId,
          path: newSess.path,
          totalTokens: newSess.totalTokens,
          startTime: newSess.startTime
        },
        ...prev
      ]);
    } else if (payload.type === 'message' && payload.message) {
      if (!current || current.sessionId === payload.session?.sessionId) {
        setActiveSession((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            ...payload.session,
            messages: [...prev.messages, payload.message!]
          };
        });
      }
    } else if (payload.type === 'tool_call' && payload.toolCall) {
      if (!current || current.sessionId === payload.session?.sessionId) {
        setActiveSession((prev) => {
          if (!prev) return null;
          const updated = [...prev.toolCalls];
          const idx = updated.findIndex((t) => t.toolIndex === payload.toolCall!.toolIndex);
          if (idx >= 0) {
            updated[idx] = payload.toolCall!;
          } else {
            updated.push(payload.toolCall!);
          }
          return { ...prev, toolCalls: updated };
        });
      }
    } else if (payload.type === 'complete' && payload.session) {
      const completed = payload.session as StreamSession;
      if (current?.sessionId === completed.sessionId) {
        setActiveSession(completed);
      }
      setSessions((prev) =>
        prev.map((s) =>
          s.sessionId === completed.sessionId
            ? { ...s, totalTokens: completed.totalTokens }
            : s
        )
      );
    }
  };

  const handleSelectSession = (id: string) => {
    fetchSessionDetail(id);
  };

  const handleExport = (format: 'jsonl' | 'json') => {
    if (!activeSession) return;
    window.open(`/api/sessions/${activeSession.sessionId}/export?format=${format}`, '_blank');
  };

  const handleClear = () => {
    fetch('/api/sessions', { method: 'DELETE' }).catch(() => {});
    setSessions([]);
    setActiveSession(null);
  };

  const handleSaveChaos = async (newConfig: Partial<ChaosConfig>) => {
    const res = await fetch('/api/chaos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig)
    });
    if (res.ok) {
      const data = await res.json();
      setChaosConfig(data.chaos);
    }
  };

  const handleTriggerScenario = async (scenario: string) => {
    try {
      // Trigger request directly via mock generator API
      await fetch('/api/mock/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario })
      });
    } catch {
      // Handled
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19] text-slate-100">
      <Navbar
        connected={connected}
        sessions={sessions}
        activeSessionId={activeSession?.sessionId}
        onSelectSession={handleSelectSession}
        onOpenMockModal={() => setMockModalOpen(true)}
        onOpenChaosModal={() => setChaosModalOpen(true)}
        onExport={handleExport}
        onClear={handleClear}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        <MetricsSummary session={activeSession || undefined} />

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-800 mb-4 pb-2">
          <button
            onClick={() => setActiveTab('waterfall')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
              activeTab === 'waterfall'
                ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/80'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Token Waterfall</span>
          </button>

          <button
            onClick={() => setActiveTab('toolcalls')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
              activeTab === 'toolcalls'
                ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/80'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Tool-Call Assembly</span>
            {activeSession && activeSession.toolCalls.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] flex items-center justify-center font-mono">
                {activeSession.toolCalls.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('events')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
              activeTab === 'events'
                ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/80'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Raw SSE Events</span>
            {activeSession && (
              <span className="text-[11px] text-slate-500 font-mono">
                ({activeSession.messages.length})
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('text')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
              activeTab === 'text'
                ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/80'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Reconstructed Text</span>
          </button>
        </div>

        {/* Tab Panes */}
        {activeTab === 'waterfall' && (
          <TokenWaterfall messages={activeSession ? activeSession.messages : []} />
        )}

        {activeTab === 'toolcalls' && (
          <ToolCallViewer toolCalls={activeSession ? activeSession.toolCalls : []} />
        )}

        {activeTab === 'events' && (
          <EventStreamTable messages={activeSession ? activeSession.messages : []} />
        )}

        {activeTab === 'text' && (
          <div className="border border-slate-800 rounded-xl bg-slate-900/60 p-4">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Assembled Response Text
            </span>
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-sm font-sans leading-relaxed min-h-[140px] whitespace-pre-wrap">
              {activeSession?.completedContent || (
                <span className="text-slate-500 italic">No text content in this stream.</span>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <ChaosControls
        isOpen={chaosModalOpen}
        currentChaos={chaosConfig}
        onClose={() => setChaosModalOpen(false)}
        onSave={handleSaveChaos}
      />

      <MockGeneratorModal
        isOpen={mockModalOpen}
        onClose={() => setMockModalOpen(false)}
        onTriggerScenario={handleTriggerScenario}
      />
    </div>
  );
};
