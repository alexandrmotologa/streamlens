import React from 'react';
import { Brain, Sparkles, Clock, Zap } from 'lucide-react';

interface ReasoningViewerProps {
  reasoningContent: string;
  completedContent: string;
  hasReasoning: boolean;
  reasoningTokens: number;
  answerTokens: number;
  timeToFirstReasoningTokenMs?: number;
  reasoningDurationMs?: number;
  reasoningTokensPerSecond?: number;
}

export const ReasoningViewer: React.FC<ReasoningViewerProps> = ({
  reasoningContent,
  completedContent,
  hasReasoning,
  reasoningTokens,
  answerTokens,
  timeToFirstReasoningTokenMs,
  reasoningDurationMs,
  reasoningTokensPerSecond
}) => {
  if (!hasReasoning && !reasoningContent) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500">
        <Brain className="w-8 h-8 text-slate-600 mb-2" />
        <p className="text-sm font-medium">No reasoning or thinking tokens detected.</p>
        <p className="text-xs mt-1 text-slate-600">
          This session does not contain DeepSeek-R1 <code className="text-purple-400">reasoning_content</code>, <code className="text-purple-400">&lt;think&gt;</code> tags, or Claude 3.7 extended thinking blocks.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Reasoning Velocity & Timing Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-purple-950/20 border border-purple-900/40 rounded-lg p-3">
          <span className="text-[11px] text-purple-400 uppercase tracking-wider font-semibold block mb-1">
            Thinking Tokens
          </span>
          <div className="text-xl font-bold font-mono text-purple-300">{reasoningTokens}</div>
          <span className="text-[10px] text-purple-400/70">CoT volume</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block mb-1">
            Answer Tokens
          </span>
          <div className="text-xl font-bold font-mono text-emerald-400">{answerTokens}</div>
          <span className="text-[10px] text-slate-500">Output volume</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block mb-1 flex items-center gap-1">
            <Clock className="w-3 h-3 text-sky-400" /> Thinking Duration
          </span>
          <div className="text-xl font-bold font-mono text-sky-400">
            {reasoningDurationMs ? `${reasoningDurationMs} ms` : 'Active'}
          </div>
          <span className="text-[10px] text-slate-500">
            TTFT: {timeToFirstReasoningTokenMs ?? 0} ms
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block mb-1 flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-400" /> Thinking Speed
          </span>
          <div className="text-xl font-bold font-mono text-amber-400">
            {reasoningTokensPerSecond ? `${reasoningTokensPerSecond} tps` : 'Calculating...'}
          </div>
          <span className="text-[10px] text-slate-500">Generation rate</span>
        </div>
      </div>

      {/* Internal Thought Process */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-purple-400">
            <Brain className="w-4 h-4" />
            Internal Reasoning / Chain-of-Thought
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded bg-purple-900/30 text-purple-300 border border-purple-800/40">
            Pre-Answer Stream
          </span>
        </div>
        <div className="bg-slate-950 border border-purple-950/60 rounded-lg p-4 font-mono text-xs text-purple-200/90 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto selection:bg-purple-900/50">
          {reasoningContent}
        </div>
      </div>

      {/* Final Answer Output */}
      {completedContent && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              <Sparkles className="w-4 h-4" />
              Final Answer Output
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-900/30 text-emerald-300 border border-emerald-800/40">
              User-Facing Stream
            </span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
            {completedContent}
          </div>
        </div>
      )}
    </div>
  );
};
