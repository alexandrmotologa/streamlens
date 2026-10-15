import React, { useState } from 'react';
import { RequestDetails } from '../../../core/types.js';
import { Copy, Check, Terminal, Code2, Bot, User, Wrench, Shield } from 'lucide-react';

interface RequestInspectorProps {
  request?: RequestDetails;
  targetUrl: string;
}

export const RequestInspector: React.FC<RequestInspectorProps> = ({ request, targetUrl }) => {
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedFetch, setCopiedFetch] = useState(false);

  if (!request) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500">
        <p className="text-sm">No request payload captured for this session.</p>
        <p className="text-xs mt-1 text-slate-600">Standard GET requests or mock triggers without request bodies have no conversation data.</p>
      </div>
    );
  }

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(request.curlCommand);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  const handleCopyFetch = () => {
    navigator.clipboard.writeText(request.fetchCode);
    setCopiedFetch(true);
    setTimeout(() => setCopiedFetch(false), 2000);
  };

  return (
    <div className="p-4 space-y-6">
      {/* Parameters & Model Summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-between">
          <span>Generation Parameters</span>
          <span className="text-xs font-mono text-sky-400 font-normal">{targetUrl}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-950 p-2.5 rounded border border-slate-800/80">
            <span className="text-slate-500 block mb-1">Model</span>
            <span className="font-mono font-medium text-slate-200">{request.model || 'Default'}</span>
          </div>
          <div className="bg-slate-950 p-2.5 rounded border border-slate-800/80">
            <span className="text-slate-500 block mb-1">Temperature</span>
            <span className="font-mono font-medium text-slate-200">{request.temperature ?? 'Unset'}</span>
          </div>
          <div className="bg-slate-950 p-2.5 rounded border border-slate-800/80">
            <span className="text-slate-500 block mb-1">Max Tokens</span>
            <span className="font-mono font-medium text-slate-200">{request.maxTokens ?? 'Unset'}</span>
          </div>
          <div className="bg-slate-950 p-2.5 rounded border border-slate-800/80">
            <span className="text-slate-500 block mb-1">Tools Count</span>
            <span className="font-mono font-medium text-sky-400">{request.tools.length}</span>
          </div>
        </div>
      </div>

      {/* Reproduction Code Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleCopyCurl}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition-colors"
        >
          {copiedCurl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Terminal className="w-3.5 h-3.5 text-sky-400" />}
          {copiedCurl ? 'Copied cURL!' : 'Copy as cURL'}
        </button>
        <button
          onClick={handleCopyFetch}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition-colors"
        >
          {copiedFetch ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Code2 className="w-3.5 h-3.5 text-emerald-400" />}
          {copiedFetch ? 'Copied Fetch!' : 'Copy as fetch()'}
        </button>
      </div>

      {/* System Prompt (if present) */}
      {request.systemPrompt && (
        <div className="bg-purple-950/20 border border-purple-900/40 rounded-lg p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">
            <Shield className="w-3.5 h-3.5" />
            System Instructions
          </div>
          <p className="text-xs font-mono text-purple-200/90 whitespace-pre-wrap leading-relaxed">
            {request.systemPrompt}
          </p>
        </div>
      )}

      {/* Conversation Thread */}
      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Messages Thread ({request.messages.length})
        </div>

        {request.messages.length === 0 ? (
          <p className="text-xs text-slate-500 italic">No conversational messages found in payload.</p>
        ) : (
          request.messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            const isAssistant = msg.role === 'assistant';
            const isSystem = msg.role === 'system';
            const isTool = msg.role === 'tool';

            const badgeBg = isUser
              ? 'bg-blue-900/40 text-blue-300 border-blue-800/60'
              : isAssistant
              ? 'bg-emerald-900/40 text-emerald-300 border-emerald-800/60'
              : isSystem
              ? 'bg-purple-900/40 text-purple-300 border-purple-800/60'
              : 'bg-amber-900/40 text-amber-300 border-amber-800/60';

            const Icon = isUser ? User : isAssistant ? Bot : isTool ? Wrench : Shield;

            return (
              <div
                key={idx}
                className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${badgeBg}`}>
                    <Icon className="w-3 h-3" />
                    {msg.role}
                    {msg.name && <span className="opacity-75">({msg.name})</span>}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">#{idx + 1}</span>
                </div>
                <div className="text-slate-300 whitespace-pre-wrap font-sans text-xs leading-relaxed pl-1">
                  {msg.content}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Tool Definitions */}
      {request.tools.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Registered Tools Schema ({request.tools.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {request.tools.map((t, idx) => (
              <div key={idx} className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-sky-400">{t.name}()</span>
                </div>
                {t.description && <p className="text-slate-400 text-[11px]">{t.description}</p>}
                {t.parameters && (
                  <pre className="bg-slate-950 p-2 rounded text-[11px] font-mono text-slate-300 overflow-x-auto border border-slate-800">
                    {JSON.stringify(t.parameters, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
