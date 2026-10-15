import React, { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar.js';
import { MetricsSummary } from './components/MetricsSummary.js';
import { TokenWaterfall } from './components/TokenWaterfall.js';
import { EventStreamTable } from './components/EventStreamTable.js';
import { ToolCallViewer } from './components/ToolCallViewer.js';
import { RequestInspector } from './components/RequestInspector.js';
import { ReasoningViewer } from './components/ReasoningViewer.js';
import { SessionDiffViewer } from './components/SessionDiffViewer.js';
import { ChaosControls } from './components/ChaosControls.js';
import { MockGeneratorModal } from './components/MockGeneratorModal.js';
import { StreamSession, ChaosConfig, SSEMessage, StreamingToolCall } from '../../core/types.js';
import { Activity, Wrench, List, FileText, Brain, MessageSquare, GitCompare } from 'lucide-react';

export const App: React.FC = () => {
  const [connected, setConnected] = useState(false);
  const [sessions, setSessions] = useState<
    Array<{ sessionId: string; path: string; totalTokens: number; startTime: number; providerType?: string }>
  >([]);
  const [activeSession, setActiveSession] = useState<StreamSession | null>(null);
  const [activeTab, setActiveTab] = useState<
    'waterfall' | 'request' | 'reasoning' | 'toolcalls' | 'events' | 'diff' | 'text'
  >('waterfall');
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

  const handleWebSocketMessage = (msg: { type: string; payload: any }) => {
    switch (msg.type) {
      case 'SESSION_START': {
        const newSession = msg.payload as StreamSession;
        setSessions((prev) => [
          {
            sessionId: newSession.sessionId,
            path: newSession.path,
            totalTokens: 0,
            startTime: newSession.startTime,
            providerType: newSession.providerType
          },
          ...prev
        ]);
        setActiveSession(newSession);
        break;
      }

      case 'MESSAGE': {
        const { sessionId, message } = msg.payload as { sessionId: string; message: SSEMessage };
        if (activeSessionRef.current && activeSessionRef.current.sessionId === sessionId) {
          setActiveSession((prev) => {
            if (!prev) return null;
            const updated = {
              ...prev,
              messages: [...prev.messages, message],
              totalTokens: prev.totalTokens + 1,
              totalBytes: prev.totalBytes + message.byteLength,
              completedContent:
                message.isReasoning ? prev.completedContent : prev.completedContent + (message.data.includes('"content":') ? '' : ''),
              reasoningContent: message.isReasoning && message.reasoningDelta
                ? prev.reasoningContent + message.reasoningDelta
                : prev.reasoningContent,
              hasReasoning: prev.hasReasoning || Boolean(message.isReasoning)
            };
            return updated;
          });
        }
        break;
      }

      case 'TOOL_CALL': {
        const { sessionId, toolCall } = msg.payload as { sessionId: string; toolCall: StreamingToolCall };
        if (activeSessionRef.current && activeSessionRef.current.sessionId === sessionId) {
          setActiveSession((prev) => {
            if (!prev) return null;
            const tcList = [...prev.toolCalls];
            const idx = tcList.findIndex((t) => t.toolIndex === toolCall.toolIndex);
            if (idx >= 0) {
              tcList[idx] = toolCall;
            } else {
              tcList.push(toolCall);
            }
            return { ...prev, toolCalls: tcList };
          });
        }
        break;
      }

      case 'ANOMALY': {
        const { sessionId, anomaly } = msg.payload;
        if (activeSessionRef.current && activeSessionRef.current.sessionId === sessionId) {
          setActiveSession((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              bufferingAnomalyDetected: true,
              anomalies: [...prev.anomalies, anomaly]
            };
          });
        }
        break;
      }

      case 'COMPLETE': {
        const completed = msg.payload as StreamSession;
        if (activeSessionRef.current && activeSessionRef.current.sessionId === completed.sessionId) {
          setActiveSession(completed);
        }
        // Update tokens in session list
        setSessions((prev) =>
          prev.map((s) => (s.sessionId === completed.sessionId ? { ...s, totalTokens: completed.totalTokens } : s))
        );
        break;
      }

      case 'CHAOS_UPDATE': {
        setChaosConfig(msg.payload as ChaosConfig);
        break;
      }
    }
  };

  const handleExport = (format: 'jsonl' | 'json' | 'html' | 'markdown') => {
    if (!activeSession) return;
    if (format === 'html') {
      window.open(`/api/sessions/${activeSession.sessionId}/export?format=html`, '_blank');
    } else {
      const a = document.createElement('a');
      a.href = `/api/sessions/${activeSession.sessionId}/export?format=${format}`;
      a.download = `streamlens-${activeSession.sessionId}.${format === 'markdown' ? 'md' : format}`;
      a.click();
    }
  };

  const handleClearSessions = async () => {
    await fetch('/api/sessions', { method: 'DELETE' });
    setSessions([]);
    setActiveSession(null);
  };

  const handleSaveChaos = async (cfg: Partial<ChaosConfig>) => {
    const res = await fetch('/api/chaos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    });
    if (res.ok) {
      const data = await res.json();
      setChaosConfig(data.chaos);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30">
      <Navbar
        connected={connected}
        sessions={sessions}
        activeSessionId={activeSession?.sessionId}
        onSelectSession={fetchSessionDetail}
        onOpenMockModal={() => setMockModalOpen(true)}
        onOpenChaosModal={() => setChaosModalOpen(true)}
        onExport={handleExport}
        onClear={handleClearSessions}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-4">
        {/* Top KPI Metrics Banner */}
        <MetricsSummary session={activeSession || undefined} />

        {/* View Tabs */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-2 gap-2">
          <div className="flex flex-wrap items-center gap-1">
            <button
              onClick={() => setActiveTab('waterfall')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'waterfall'
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Token Waterfall</span>
            </button>

            <button
              onClick={() => setActiveTab('request')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'request'
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Request & Prompt</span>
              {activeSession?.request?.messages && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-950 text-blue-300 border border-blue-800">
                  {activeSession.request.messages.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('reasoning')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'reasoning'
                  ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Brain className="w-3.5 h-3.5" />
              <span>Reasoning (CoT)</span>
              {activeSession?.hasReasoning && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-950 text-purple-300 border border-purple-800">
                  {activeSession.reasoningTokens}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('toolcalls')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'toolcalls'
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Tool Calls</span>
              {activeSession && activeSession.toolCalls.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                  {activeSession.toolCalls.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('events')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'events'
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Raw Events</span>
              {activeSession && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">
                  {activeSession.messages.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('text')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'text'
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Output Text</span>
            </button>

            <button
              onClick={() => setActiveTab('diff')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'diff'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>Benchmark Diff</span>
            </button>
          </div>

          {activeSession && (
            <div className="text-[11px] font-mono text-slate-500 hidden md:block">
              Target: <span className="text-slate-400">{activeSession.targetUrl}</span>
            </div>
          )}
        </div>

        {/* Tab Views */}
        <div className="bg-[#0f172a]/60 border border-slate-800/80 rounded-2xl p-4 min-h-[460px]">
          {activeTab === 'waterfall' && (
            <TokenWaterfall
              messages={activeSession?.messages || []}
              startTime={activeSession?.startTime || Date.now()}
            />
          )}

          {activeTab === 'request' && (
            <RequestInspector
              request={activeSession?.request}
              targetUrl={activeSession?.targetUrl || 'http://localhost:50085/v1'}
            />
          )}

          {activeTab === 'reasoning' && (
            <ReasoningViewer
              reasoningContent={activeSession?.reasoningContent || ''}
              completedContent={activeSession?.completedContent || ''}
              hasReasoning={activeSession?.hasReasoning || false}
              reasoningTokens={activeSession?.reasoningTokens || 0}
              answerTokens={activeSession?.answerTokens || 0}
              timeToFirstReasoningTokenMs={activeSession?.timeToFirstReasoningTokenMs}
              reasoningDurationMs={activeSession?.reasoningDurationMs}
              reasoningTokensPerSecond={activeSession?.reasoningTokensPerSecond}
            />
          )}

          {activeTab === 'toolcalls' && (
            <ToolCallViewer toolCalls={activeSession?.toolCalls || []} />
          )}

          {activeTab === 'events' && (
            <EventStreamTable messages={activeSession?.messages || []} />
          )}

          {activeTab === 'text' && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Reconstructed Streamed Text Content
              </span>
              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto">
                {activeSession?.completedContent || '(No text content generated yet)'}
              </pre>
            </div>
          )}

          {activeTab === 'diff' && (
            <SessionDiffViewer
              sessions={sessions as any}
              currentSessionId={activeSession?.sessionId}
            />
          )}
        </div>
      </main>

      {/* Chaos Settings Modal */}
      <ChaosControls
        isOpen={chaosModalOpen}
        currentChaos={chaosConfig}
        activeSessionId={activeSession?.sessionId}
        onClose={() => setChaosModalOpen(false)}
        onSave={handleSaveChaos}
      />

      {/* Mock Stream Scenario Trigger Modal */}
      <MockGeneratorModal
        isOpen={mockModalOpen}
        onClose={() => setMockModalOpen(false)}
        onTriggerScenario={async (scenario) => {
          await fetch('/api/mock/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scenario })
          });
          setMockModalOpen(false);
        }}
      />
    </div>
  );
};
