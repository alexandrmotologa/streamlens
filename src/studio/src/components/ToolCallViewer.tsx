import React from 'react';
import { Wrench, CheckCircle2, AlertCircle, RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-react';
import { StreamingToolCall } from '../../../core/types.js';

interface ToolCallViewerProps {
  toolCalls: StreamingToolCall[];
}

export const ToolCallViewer: React.FC<ToolCallViewerProps> = ({ toolCalls }) => {
  if (toolCalls.length === 0) {
    return (
      <div className="p-8 text-center border border-slate-800 rounded-xl bg-slate-900/40 text-slate-500 text-xs">
        No tool calls detected in this session.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toolCalls.map((tc) => {
        let statusBadge = (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-mono flex items-center gap-1 bg-amber-950 text-amber-400 border border-amber-800">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Streaming Partial AST ({tc.deltaCount} deltas)
          </span>
        );

        if (tc.isValidJson) {
          statusBadge = (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono flex items-center gap-1 bg-emerald-950 text-emerald-400 border border-emerald-800">
              <CheckCircle2 className="w-3 h-3" />
              Valid JSON Assembled
            </span>
          );
        } else if (tc.currentParseError) {
          statusBadge = (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono flex items-center gap-1 bg-rose-950 text-rose-400 border border-rose-800">
              <AlertCircle className="w-3 h-3" />
              Syntax Error
            </span>
          );
        }

        let schemaBadge = null;
        if (tc.schemaStatus === 'valid') {
          schemaBadge = (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono flex items-center gap-1 bg-emerald-950/80 text-emerald-400 border border-emerald-800/80">
              <ShieldCheck className="w-3 h-3" />
              Schema Valid
            </span>
          );
        } else if (tc.schemaStatus === 'invalid') {
          schemaBadge = (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono flex items-center gap-1 bg-rose-950/80 text-rose-400 border border-rose-800/80">
              <ShieldAlert className="w-3 h-3" />
              Schema Invalid
            </span>
          );
        } else if (tc.schemaStatus === 'incomplete_valid') {
          schemaBadge = (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono flex items-center gap-1 bg-sky-950/80 text-sky-400 border border-sky-800/80">
              <ShieldCheck className="w-3 h-3" />
              Schema Matches (In-Flight)
            </span>
          );
        }

        return (
          <div
            key={tc.toolIndex}
            className="border border-slate-800 rounded-xl bg-slate-900/60 overflow-hidden"
          >
            {/* Header */}
            <div className="p-3.5 border-b border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-800/60">
                  <Wrench className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-mono font-semibold text-xs text-white">
                    {tc.toolName}
                  </span>
                  {tc.toolId && (
                    <span className="ml-2 text-[11px] font-mono text-slate-500">
                      id: {tc.toolId}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {schemaBadge}
                {statusBadge}
              </div>
            </div>

            {/* Schema Errors Warning */}
            {tc.schemaErrors && tc.schemaErrors.length > 0 && (
              <div className="px-4 py-2 bg-rose-950/30 border-b border-rose-900/30 text-[11px] text-rose-300 space-y-1">
                <div className="font-semibold text-rose-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Schema Validation Violations:
                </div>
                {tc.schemaErrors.map((err, i) => (
                  <div key={i} className="pl-4 font-mono">• {err}</div>
                ))}
              </div>
            )}

            {/* Content Body */}
            <div className="p-3.5 grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs font-mono">
              {/* Left: Reconstructed JSON Object Tree */}
              <div>
                <div className="text-[11px] text-slate-400 font-semibold mb-1.5 flex items-center justify-between">
                  <span>Reconstructed JSON AST</span>
                  <span className="text-[10px] text-slate-500">Real-Time State</span>
                </div>
                <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 overflow-x-auto text-emerald-300 max-h-56">
                  {tc.parsedArguments
                    ? JSON.stringify(tc.parsedArguments, null, 2)
                    : '// Awaiting valid tokens...'}
                </pre>
              </div>

              {/* Right: Raw Wire Streaming Chunks Accumulator */}
              <div>
                <div className="text-[11px] text-slate-400 font-semibold mb-1.5 flex items-center justify-between">
                  <span>Raw Streaming String Buffer</span>
                  <span className="text-[10px] text-slate-500">
                    {new TextEncoder().encode(tc.accumulatedArgumentJson || '').length} bytes
                  </span>
                </div>
                <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 overflow-x-auto text-slate-300 max-h-56">
                  {tc.accumulatedArgumentJson || '// No argument bytes yet'}
                </pre>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
