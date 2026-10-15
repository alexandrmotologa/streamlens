import React, { useState } from 'react';
import { SSEMessage } from '../../../core/types.js';
import { Search } from 'lucide-react';

interface EventStreamTableProps {
  messages: SSEMessage[];
}

export const EventStreamTable: React.FC<EventStreamTableProps> = ({ messages }) => {
  const [filter, setFilter] = useState('');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const filtered = messages.filter((m) => {
    if (!filter) return true;
    const lower = filter.toLowerCase();
    return (
      m.event.toLowerCase().includes(lower) ||
      m.data.toLowerCase().includes(lower) ||
      (m.id && m.id.toLowerCase().includes(lower))
    );
  });

  return (
    <div className="border border-slate-800 rounded-xl bg-slate-900/60 overflow-hidden">
      {/* Header with Search */}
      <div className="p-3.5 border-b border-slate-800 flex items-center justify-between gap-3">
        <span className="font-semibold text-xs text-slate-200">Raw SSE Event Log</span>
        <div className="relative w-48 sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Filter events..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-96">
        <table className="w-full text-left font-mono text-xs divide-y divide-slate-800/60">
          <thead className="bg-slate-950/60 text-slate-400 text-[11px] uppercase tracking-wider sticky top-0">
            <tr>
              <th className="px-3.5 py-2">#</th>
              <th className="px-3.5 py-2">Delta</th>
              <th className="px-3.5 py-2">Event</th>
              <th className="px-3.5 py-2">Bytes</th>
              <th className="px-3.5 py-2">Data Payload</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40 text-slate-300">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3.5 py-8 text-center text-slate-500">
                  No matching events found.
                </td>
              </tr>
            ) : (
              filtered.map((msg, idx) => {
                const isExpanded = expandedIndex === idx;
                return (
                  <React.Fragment key={idx}>
                    <tr
                      onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                      className="hover:bg-slate-800/30 cursor-pointer transition"
                    >
                      <td className="px-3.5 py-2 text-slate-500">{idx + 1}</td>
                      <td className="px-3.5 py-2">
                        <span
                          className={`font-semibold ${
                            msg.deltaFromPreviousMs > 150
                              ? 'text-rose-400'
                              : msg.deltaFromPreviousMs > 80
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {msg.deltaFromPreviousMs}ms
                        </span>
                      </td>
                      <td className="px-3.5 py-2 text-cyan-400">{msg.event}</td>
                      <td className="px-3.5 py-2 text-slate-400">{msg.byteLength}B</td>
                      <td className="px-3.5 py-2 max-w-xs sm:max-w-md truncate text-slate-200">
                        {msg.data}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-950/80">
                        <td colSpan={5} className="p-3 text-[11px]">
                          <div className="text-slate-400 mb-1">Exact Wire Chunk:</div>
                          <pre className="p-2.5 rounded bg-slate-900 border border-slate-800 text-slate-200 overflow-x-auto whitespace-pre-wrap">
                            {msg.rawChunk}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
