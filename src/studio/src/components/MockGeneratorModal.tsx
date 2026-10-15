import React, { useState } from 'react';
import { X, Play, Zap, ShieldAlert, Wrench, AlertOctagon } from 'lucide-react';

interface MockGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerScenario: (scenario: string) => Promise<void>;
}

export const MockGeneratorModal: React.FC<MockGeneratorModalProps> = ({
  isOpen,
  onClose,
  onTriggerScenario
}) => {
  const [running, setRunning] = useState<string | null>(null);

  if (!isOpen) return null;

  const scenarios = [
    {
      id: 'smooth',
      title: 'Smooth SSE Token Stream',
      desc: 'Standard typewriter effect with ~35ms intervals. Benchmark clean stream.',
      icon: Zap,
      color: 'text-emerald-400 bg-emerald-950/40 border-emerald-800'
    },
    {
      id: 'nginx-buffered',
      title: 'Nginx 4KB Proxy Buffering',
      desc: 'Simulates reverse proxy buffer holding back chunks until ~4096 bytes accumulate, then bursting in <2ms.',
      icon: ShieldAlert,
      color: 'text-amber-400 bg-amber-950/40 border-amber-800'
    },
    {
      id: 'jitter',
      title: 'High Inter-Token Jitter',
      desc: 'Erratic latency spikes up to 420ms simulating LLM server queue throttling and network congestion.',
      icon: ShieldAlert,
      color: 'text-yellow-400 bg-yellow-950/40 border-yellow-800'
    },
    {
      id: 'tool-call',
      title: 'Streaming Tool-Call Assembly',
      desc: 'Streams fragmented partial JSON arguments for a database query tool call across 8 delta chunks.',
      icon: Wrench,
      color: 'text-cyan-400 bg-cyan-950/40 border-cyan-800'
    },
    {
      id: 'interrupted',
      title: 'Abrupt Mid-Stream Disconnect',
      desc: 'Terminates TCP stream without finish reason to test client reconnection and partial recovery.',
      icon: AlertOctagon,
      color: 'text-rose-400 bg-rose-950/40 border-rose-800'
    }
  ];

  const handleRun = async (id: string) => {
    setRunning(id);
    try {
      await onTriggerScenario(id);
      onClose();
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Play className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Stream Scenario Simulator</h2>
              <p className="text-[11px] text-slate-400">Trigger test SSE streams without needing external API keys</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* List of scenarios */}
        <div className="p-4 space-y-2.5 max-h-[60vh] overflow-y-auto">
          {scenarios.map((sc) => {
            const Icon = sc.icon;
            const isCurrentlyRunning = running === sc.id;

            return (
              <div
                key={sc.id}
                className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg border shrink-0 ${sc.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-white">{sc.title}</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{sc.desc}</p>
                  </div>
                </div>

                <button
                  onClick={() => handleRun(sc.id)}
                  disabled={Boolean(running)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium shrink-0 flex items-center gap-1.5 border border-slate-700 transition disabled:opacity-50"
                >
                  <Play className="w-3 h-3" />
                  <span>{isCurrentlyRunning ? 'Triggering...' : 'Simulate'}</span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
