import React, { useState } from 'react';
import { ShieldAlert, Play, Download, Trash2, FileCode, FileText, Check } from 'lucide-react';

interface NavbarProps {
  connected: boolean;
  sessions: Array<{ sessionId: string; path: string; totalTokens: number; startTime: number; providerType?: string }>;
  activeSessionId?: string;
  onSelectSession: (id: string) => void;
  onOpenMockModal: () => void;
  onOpenChaosModal: () => void;
  onExport: (format: 'jsonl' | 'json' | 'html' | 'markdown') => void;
  onClear: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  connected,
  sessions,
  activeSessionId,
  onSelectSession,
  onOpenMockModal,
  onOpenChaosModal,
  onExport,
  onClear
}) => {
  const [copiedMd, setCopiedMd] = useState(false);

  const handleCopyMarkdown = async () => {
    if (!activeSessionId) return;
    try {
      const res = await fetch(`/api/sessions/${activeSessionId}/export?format=markdown`);
      if (res.ok) {
        const text = await res.text();
        await navigator.clipboard.writeText(text);
        setCopiedMd(true);
        setTimeout(() => setCopiedMd(false), 2000);
      }
    } catch {
      // Ignore
    }
  };

  return (
    <header className="border-b border-slate-800 bg-[#0f172a]/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-mono font-bold text-lg">
            SL
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-white font-mono">StreamLens</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60 font-mono">
                Studio
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">LLM Token Stream Inspector</p>
          </div>
        </div>

        {/* Center: Session Picker & Export Actions */}
        <div className="flex items-center gap-2">
          <select
            value={activeSessionId || ''}
            onChange={(e) => onSelectSession(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-md px-3 py-1.5 focus:outline-none focus:border-cyan-500 max-w-[240px] truncate font-mono"
          >
            {sessions.length === 0 ? (
              <option value="">No Active Streams</option>
            ) : (
              sessions.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>
                  {s.sessionId.replace('sess-', '')} ({s.totalTokens} tok • {s.providerType || 'openai'})
                </option>
              ))
            )}
          </select>

          {activeSessionId && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onExport('html')}
                title="Download Standalone HTML Diagnostic Report"
                className="px-2.5 py-1.5 text-xs font-medium rounded bg-slate-800 hover:bg-slate-700 text-sky-300 flex items-center gap-1.5 border border-slate-700 transition"
              >
                <FileCode className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">HTML Report</span>
              </button>
              <button
                onClick={handleCopyMarkdown}
                title="Copy GitHub Markdown Report to Clipboard"
                className="px-2.5 py-1.5 text-xs font-medium rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1.5 border border-slate-700 transition"
              >
                {copiedMd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <FileText className="w-3.5 h-3.5" />}
                <span className="hidden lg:inline">{copiedMd ? 'Copied MD' : 'Copy MD'}</span>
              </button>
              <button
                onClick={() => onExport('jsonl')}
                title="Export Stream as JSONL"
                className="px-2 py-1.5 text-xs font-medium rounded bg-slate-800 hover:bg-slate-700 text-slate-400 flex items-center gap-1 border border-slate-700 transition"
              >
                <Download className="w-3 h-3" />
                <span className="hidden xl:inline">JSONL</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2.5">
          {/* Live WS Status */}
          <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800">
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
              }`}
            />
            <span className="text-slate-400 hidden sm:inline">{connected ? 'Live' : 'Offline'}</span>
          </div>

          {/* Trigger Mock Stream */}
          <button
            onClick={onOpenMockModal}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5 shadow-sm shadow-cyan-600/30 transition"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Simulate Stream</span>
          </button>

          {/* Chaos / Breakpoints Toggle */}
          <button
            onClick={onOpenChaosModal}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1.5 transition"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Chaos</span>
          </button>

          {sessions.length > 0 && (
            <button
              onClick={onClear}
              title="Clear All Sessions"
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
