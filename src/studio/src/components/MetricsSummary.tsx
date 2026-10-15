import React from 'react';
import { Clock, Zap, Gauge, AlertTriangle, CheckCircle2, Layers } from 'lucide-react';
import { StreamSession } from '../../../core/types.js';

interface MetricsSummaryProps {
  session?: StreamSession;
}

export const MetricsSummary: React.FC<MetricsSummaryProps> = ({ session }) => {
  if (!session) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse h-24" />
        ))}
      </div>
    );
  }

  const isAnomalous = session.bufferingAnomalyDetected || session.anomalies.length > 0;

  return (
    <div className="space-y-3 mb-6">
      {/* Anomaly Banner if detected */}
      {isAnomalous && (
        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-semibold text-rose-300">Proxy Buffering Anomaly Flagged: </span>
            <span className="text-rose-200/90">
              {session.anomalies[0]?.message || 'Tokens arrived in coalesced bursts following long idle pauses.'}
            </span>
          </div>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* TTFT */}
        <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Time to First Token</span>
            <Clock className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-white">
              {session.timeToFirstTokenMs}
            </span>
            <span className="text-xs font-mono text-slate-400">ms</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Prompt processing delay</p>
        </div>

        {/* Tokens Per Second */}
        <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Throughput</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-white">
              {session.tokensPerSecond}
            </span>
            <span className="text-xs font-mono text-slate-400">tok/s</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Sustained streaming rate</p>
        </div>

        {/* Avg Inter-Token Delta */}
        <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Avg Delta</span>
            <Gauge className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-white">
              {session.averageInterTokenDeltaMs}
            </span>
            <span className="text-xs font-mono text-slate-400">ms</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Mean interval between tokens</p>
        </div>

        {/* Max Jitter */}
        <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Max Jitter</span>
            <AlertTriangle className={`w-4 h-4 ${session.maxTokenJitterMs > 150 ? 'text-rose-400' : 'text-slate-400'}`} />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-xl font-bold font-mono ${session.maxTokenJitterMs > 150 ? 'text-rose-400' : 'text-white'}`}>
              {session.maxTokenJitterMs}
            </span>
            <span className="text-xs font-mono text-slate-400">ms</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Peak arrival stutter</p>
        </div>

        {/* Total Tokens & Bytes */}
        <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Total Volume</span>
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-white">
              {session.totalTokens}
            </span>
            <span className="text-xs font-mono text-slate-400">tokens ({session.totalBytes}B)</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {session.messages.length} raw SSE frames
          </p>
        </div>
      </div>
    </div>
  );
};
