import React, { useState } from 'react';
import { SSEMessage } from '../../../core/types.js';

interface TokenWaterfallProps {
  messages: SSEMessage[];
}

export const TokenWaterfall: React.FC<TokenWaterfallProps> = ({ messages }) => {
  const [selectedMsgIndex, setSelectedMsgIndex] = useState<number | null>(null);

  if (messages.length === 0) {
    return (
      <div className="p-8 text-center border border-slate-800 rounded-xl bg-slate-900/40 text-slate-500 text-xs">
        No token events captured yet. Send a streaming request to begin.
      </div>
    );
  }

  // Calculate maximum delta for normalized bar widths
  const maxDelta = Math.max(100, ...messages.map((m) => m.deltaFromPreviousMs));

  return (
    <div className="border border-slate-800 rounded-xl bg-slate-900/60 overflow-hidden">
      <div className="p-3.5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs text-slate-200">Token Arrival Waterfall</span>
          <span className="text-[11px] text-slate-500 font-mono">({messages.length} chunks)</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> &lt;40ms
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-400" /> 40-80ms
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> 80-150ms
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500" /> &gt;150ms
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-500" /> Buffer Burst
          </span>
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/40 font-mono text-xs">
        {messages.map((msg, idx) => {
          const delta = msg.deltaFromPreviousMs;
          const barWidthPercent = Math.min(100, Math.max(2, (delta / maxDelta) * 100));

          let barColor = 'bg-emerald-500';
          let textColor = 'text-emerald-400';

          if (msg.isBufferingBurst) {
            barColor = 'bg-purple-500';
            textColor = 'text-purple-400';
          } else if (delta > 300) {
            barColor = 'bg-rose-500';
            textColor = 'text-rose-400';
          } else if (delta > 150) {
            barColor = 'bg-amber-500';
            textColor = 'text-amber-400';
          } else if (delta > 80) {
            barColor = 'bg-yellow-500';
            textColor = 'text-yellow-400';
          } else if (delta > 40) {
            barColor = 'bg-cyan-500';
            textColor = 'text-cyan-400';
          }

          const isSelected = selectedMsgIndex === idx;

          // Extract token snippet
          let snippet = msg.data;
          try {
            const parsed = JSON.parse(msg.data);
            if (parsed.choices?.[0]?.delta?.content) {
              snippet = parsed.choices[0].delta.content;
            } else if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              snippet = parsed.delta.text;
            } else if (parsed.choices?.[0]?.delta?.tool_calls?.[0]?.function?.arguments) {
              snippet = `tool_arg: ${parsed.choices[0].delta.tool_calls[0].function.arguments}`;
            }
          } catch {
            // Raw text
          }

          return (
            <div
              key={idx}
              onClick={() => setSelectedMsgIndex(isSelected ? null : idx)}
              className={`px-3.5 py-1.5 flex items-center gap-3 cursor-pointer transition ${
                isSelected ? 'bg-cyan-950/40' : 'hover:bg-slate-800/40'
              }`}
            >
              <span className="w-8 text-slate-500 text-[11px] shrink-0">#{idx + 1}</span>

              {/* Delta Tag */}
              <span className={`w-16 text-right shrink-0 font-bold ${textColor}`}>
                {delta}ms
              </span>

              {/* Waterfall bar */}
              <div className="flex-1 bg-slate-800/50 rounded-full h-2.5 overflow-hidden flex">
                <div
                  className={`h-full rounded-full transition-all duration-150 ${barColor}`}
                  style={{ width: `${barWidthPercent}%` }}
                />
              </div>

              {/* Byte Size */}
              <span className="text-[11px] text-slate-500 w-12 text-right shrink-0">
                {msg.byteLength}B
              </span>

              {/* Token Preview */}
              <span className="w-48 truncate text-slate-300 text-[11px] shrink-0">
                {JSON.stringify(snippet)}
              </span>

              {msg.isBufferingBurst && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-950 text-purple-300 border border-purple-800">
                  BURST
                </span>
              )}
            </div>
          );
        })}
      </div>

      {selectedMsgIndex !== null && messages[selectedMsgIndex] && (
        <div className="p-3 bg-slate-950 border-t border-slate-800 text-xs font-mono">
          <div className="flex items-center justify-between text-slate-400 mb-1 text-[11px]">
            <span>Raw Frame #{selectedMsgIndex + 1} Inspector</span>
            <span>Delta: {messages[selectedMsgIndex].deltaFromPreviousMs}ms</span>
          </div>
          <pre className="p-2 bg-slate-900 rounded border border-slate-800/60 overflow-x-auto text-slate-200 text-[11px]">
            {messages[selectedMsgIndex].rawChunk}
          </pre>
        </div>
      )}
    </div>
  );
};
