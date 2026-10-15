import React, { useState, useEffect } from 'react';
import { GitCompare, ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface SessionSummaryItem {
  sessionId: string;
  path: string;
  totalTokens: number;
  tokensPerSecond: number;
  timeToFirstTokenMs: number;
  averageInterTokenDeltaMs: number;
  p95TokenJitterMs: number;
  providerType: string;
}

interface SessionDiffViewerProps {
  sessions: SessionSummaryItem[];
  currentSessionId?: string;
}

export const SessionDiffViewer: React.FC<SessionDiffViewerProps> = ({ sessions, currentSessionId }) => {
  const [selectedA, setSelectedA] = useState<string>(currentSessionId || (sessions[0]?.sessionId ?? ''));
  const [selectedB, setSelectedB] = useState<string>(sessions[1]?.sessionId || (sessions[0]?.sessionId ?? ''));
  const [diffData, setDiffData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedA && selectedB) {
      setLoading(true);
      fetch(`/api/sessions/diff?a=${selectedA}&b=${selectedB}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          setDiffData(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [selectedA, selectedB]);

  if (sessions.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500">
        <GitCompare className="w-8 h-8 text-slate-600 mb-2" />
        <p className="text-sm font-medium">At least two sessions are required for benchmark comparison.</p>
        <p className="text-xs mt-1 text-slate-600">Trigger additional streams or mock scenarios to compare latency metrics.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Session Selectors */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row items-center gap-4 justify-between">
        <div className="w-full sm:w-1/2 space-y-1.5">
          <label className="text-xs font-semibold text-sky-400 uppercase tracking-wider block">
            Baseline Session (A)
          </label>
          <select
            value={selectedA}
            onChange={(e) => setSelectedA(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500"
          >
            {sessions.map((s) => (
              <option key={s.sessionId} value={s.sessionId}>
                {s.sessionId} ({s.providerType} • {s.totalTokens} tok • {s.tokensPerSecond} tps)
              </option>
            ))}
          </select>
        </div>

        <div className="hidden sm:flex text-slate-600">
          <ArrowRight className="w-5 h-5" />
        </div>

        <div className="w-full sm:w-1/2 space-y-1.5">
          <label className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block">
            Comparison Target (B)
          </label>
          <select
            value={selectedB}
            onChange={(e) => setSelectedB(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
          >
            {sessions.map((s) => (
              <option key={s.sessionId} value={s.sessionId}>
                {s.sessionId} ({s.providerType} • {s.totalTokens} tok • {s.tokensPerSecond} tps)
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <div className="text-center text-xs text-slate-500 py-4">Calculating benchmark diff...</div>}

      {diffData && (
        <div className="space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Performance Metrics Delta (B relative to A)
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* TTFT Delta */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider block mb-1">
                TTFT Delta
              </span>
              <div className="flex items-center gap-2">
                <span className={`text-xl font-bold font-mono ${diffData.delta.ttftMsDiff < 0 ? 'text-emerald-400' : diffData.delta.ttftMsDiff > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                  {diffData.delta.ttftMsDiff > 0 ? `+${diffData.delta.ttftMsDiff}` : diffData.delta.ttftMsDiff} ms
                </span>
                {diffData.delta.ttftMsDiff < 0 ? (
                  <TrendingDown className="w-4 h-4 text-emerald-400" />
                ) : diffData.delta.ttftMsDiff > 0 ? (
                  <TrendingUp className="w-4 h-4 text-rose-400" />
                ) : (
                  <Minus className="w-4 h-4 text-slate-500" />
                )}
              </div>
              <span className="text-[10px] text-slate-500">
                A: {diffData.sessionA.ttftMs}ms vs B: {diffData.sessionB.ttftMs}ms
              </span>
            </div>

            {/* TPS Delta */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider block mb-1">
                Token Speed Delta
              </span>
              <div className="flex items-center gap-2">
                <span className={`text-xl font-bold font-mono ${diffData.delta.tpsDiff > 0 ? 'text-emerald-400' : diffData.delta.tpsDiff < 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                  {diffData.delta.tpsDiff > 0 ? `+${diffData.delta.tpsDiff}` : diffData.delta.tpsDiff} tps
                </span>
                {diffData.delta.tpsDiff > 0 ? (
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                ) : diffData.delta.tpsDiff < 0 ? (
                  <TrendingDown className="w-4 h-4 text-rose-400" />
                ) : (
                  <Minus className="w-4 h-4 text-slate-500" />
                )}
              </div>
              <span className="text-[10px] text-slate-500">
                A: {diffData.sessionA.tps} tps vs B: {diffData.sessionB.tps} tps
              </span>
            </div>

            {/* p95 Jitter Delta */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider block mb-1">
                Jitter (p95) Delta
              </span>
              <div className="flex items-center gap-2">
                <span className={`text-xl font-bold font-mono ${diffData.delta.p95JitterDiff < 0 ? 'text-emerald-400' : diffData.delta.p95JitterDiff > 0 ? 'text-amber-400' : 'text-slate-200'}`}>
                  {diffData.delta.p95JitterDiff > 0 ? `+${diffData.delta.p95JitterDiff}` : diffData.delta.p95JitterDiff} ms
                </span>
                {diffData.delta.p95JitterDiff < 0 ? (
                  <TrendingDown className="w-4 h-4 text-emerald-400" />
                ) : diffData.delta.p95JitterDiff > 0 ? (
                  <TrendingUp className="w-4 h-4 text-amber-400" />
                ) : (
                  <Minus className="w-4 h-4 text-slate-500" />
                )}
              </div>
              <span className="text-[10px] text-slate-500">
                A: {diffData.sessionA.p95JitterMs}ms vs B: {diffData.sessionB.p95JitterMs}ms
              </span>
            </div>
          </div>

          {/* Side by Side Comparative Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[500px]">
              <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-3">Metric</th>
                  <th className="p-3 text-sky-400 font-mono">Session A ({diffData.sessionA.provider})</th>
                  <th className="p-3 text-emerald-400 font-mono">Session B ({diffData.sessionB.provider})</th>
                  <th className="p-3 text-slate-300">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                <tr>
                  <td className="p-3 text-slate-300 font-sans">Time to First Token (TTFT)</td>
                  <td className="p-3 text-slate-200">{diffData.sessionA.ttftMs} ms</td>
                  <td className="p-3 text-slate-200">{diffData.sessionB.ttftMs} ms</td>
                  <td className="p-3 text-slate-400">{diffData.delta.ttftMsDiff} ms</td>
                </tr>
                <tr>
                  <td className="p-3 text-slate-300 font-sans">Token Speed (TPS)</td>
                  <td className="p-3 text-slate-200">{diffData.sessionA.tps} tps</td>
                  <td className="p-3 text-slate-200">{diffData.sessionB.tps} tps</td>
                  <td className="p-3 text-slate-400">{diffData.delta.tpsDiff} tps</td>
                </tr>
                <tr>
                  <td className="p-3 text-slate-300 font-sans">Inter-Token Delta (Avg)</td>
                  <td className="p-3 text-slate-200">{diffData.sessionA.avgDeltaMs} ms</td>
                  <td className="p-3 text-slate-200">{diffData.sessionB.avgDeltaMs} ms</td>
                  <td className="p-3 text-slate-400">
                    {(diffData.sessionB.avgDeltaMs - diffData.sessionA.avgDeltaMs).toFixed(1)} ms
                  </td>
                </tr>
                <tr>
                  <td className="p-3 text-slate-300 font-sans">Jitter (p95)</td>
                  <td className="p-3 text-slate-200">{diffData.sessionA.p95JitterMs} ms</td>
                  <td className="p-3 text-slate-200">{diffData.sessionB.p95JitterMs} ms</td>
                  <td className="p-3 text-slate-400">{diffData.delta.p95JitterDiff} ms</td>
                </tr>
                <tr>
                  <td className="p-3 text-slate-300 font-sans">Buffer Anomalies</td>
                  <td className="p-3 text-slate-200">{diffData.sessionA.anomalies}</td>
                  <td className="p-3 text-slate-200">{diffData.sessionB.anomalies}</td>
                  <td className="p-3 text-slate-400">
                    {diffData.sessionB.anomalies - diffData.sessionA.anomalies}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
