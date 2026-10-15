import React, { useState } from 'react';
import { X, ShieldAlert, Check } from 'lucide-react';
import { ChaosConfig } from '../../../core/types.js';

interface ChaosControlsProps {
  currentChaos: ChaosConfig;
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: Partial<ChaosConfig>) => Promise<void>;
}

export const ChaosControls: React.FC<ChaosControlsProps> = ({
  currentChaos,
  isOpen,
  onClose,
  onSave
}) => {
  const [enabled, setEnabled] = useState(currentChaos.enabled);
  const [bufferBytes, setBufferBytes] = useState(currentChaos.bufferThresholdBytes || 0);
  const [minJitter, setMinJitter] = useState(currentChaos.minJitterMs || 0);
  const [maxJitter, setMaxJitter] = useState(currentChaos.maxJitterMs || 0);
  const [dropAtToken, setDropAtToken] = useState<string>(
    currentChaos.dropAtToken ? String(currentChaos.dropAtToken) : ''
  );
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleApplyPreset = (type: 'nginx' | 'jitter' | 'drop' | 'clean') => {
    switch (type) {
      case 'nginx':
        setEnabled(true);
        setBufferBytes(4096);
        setMinJitter(0);
        setMaxJitter(0);
        setDropAtToken('');
        break;
      case 'jitter':
        setEnabled(true);
        setBufferBytes(0);
        setMinJitter(80);
        setMaxJitter(250);
        setDropAtToken('');
        break;
      case 'drop':
        setEnabled(true);
        setBufferBytes(0);
        setMinJitter(0);
        setMaxJitter(0);
        setDropAtToken('15');
        break;
      case 'clean':
        setEnabled(false);
        setBufferBytes(0);
        setMinJitter(0);
        setMaxJitter(0);
        setDropAtToken('');
        break;
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        enabled,
        bufferThresholdBytes: bufferBytes,
        minJitterMs: minJitter,
        maxJitterMs: maxJitter,
        dropAtToken: dropAtToken ? parseInt(dropAtToken, 10) : undefined
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Chaos & Buffering Simulation</h2>
              <p className="text-[11px] text-slate-400">Inject synthetic proxy buffering, jitter, and disconnects</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Presets */}
        <div className="p-4 bg-slate-900/50 border-b border-slate-800/80">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
            Quick Simulation Presets
          </span>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              onClick={() => handleApplyPreset('nginx')}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-left border border-slate-700 transition"
            >
              <div className="font-medium text-amber-400">Nginx 4KB Buffer</div>
              <div className="text-[11px] text-slate-400">Coalesces chunks until 4096 bytes</div>
            </button>
            <button
              onClick={() => handleApplyPreset('jitter')}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-left border border-slate-700 transition"
            >
              <div className="font-medium text-cyan-400">High Token Jitter</div>
              <div className="text-[11px] text-slate-400">80-250ms random delay per chunk</div>
            </button>
            <button
              onClick={() => handleApplyPreset('drop')}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-left border border-slate-700 transition"
            >
              <div className="font-medium text-rose-400">Drop at Token #15</div>
              <div className="text-[11px] text-slate-400">Terminates TCP stream mid-generation</div>
            </button>
            <button
              onClick={() => handleApplyPreset('clean')}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-left border border-slate-700 transition"
            >
              <div className="font-medium text-emerald-400">Zero Chaos (Clean)</div>
              <div className="text-[11px] text-slate-400">Direct passthrough, no injection</div>
            </button>
          </div>
        </div>

        {/* Custom Form */}
        <div className="p-4 space-y-4 text-xs">
          {/* Enabled Switch */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800">
            <div>
              <span className="font-semibold text-slate-200">Enable Chaos Engine</span>
              <p className="text-[11px] text-slate-400">Applies configured rules to proxy responses</p>
            </div>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`w-11 h-6 rounded-full transition-colors p-1 flex items-center ${
                enabled ? 'bg-amber-500 justify-end' : 'bg-slate-700 justify-start'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
            </button>
          </div>

          {/* Buffer Threshold */}
          <div>
            <label className="font-medium text-slate-300 block mb-1">
              Proxy Buffering Threshold: <span className="font-mono text-cyan-400">{bufferBytes} Bytes</span>
            </label>
            <input
              type="range"
              min="0"
              max="8192"
              step="512"
              value={bufferBytes}
              onChange={(e) => setBufferBytes(parseInt(e.target.value, 10))}
              className="w-full accent-cyan-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
              <span>0B (Disabled)</span>
              <span>4096B (Nginx default)</span>
              <span>8192B (8KB)</span>
            </div>
          </div>

          {/* Jitter range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-medium text-slate-300 block mb-1">Min Jitter (ms)</label>
              <input
                type="number"
                min="0"
                max="2000"
                value={minJitter}
                onChange={(e) => setMinJitter(parseInt(e.target.value || '0', 10))}
                className="w-full bg-slate-900 border border-slate-800 rounded-md p-2 text-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="font-medium text-slate-300 block mb-1">Max Jitter (ms)</label>
              <input
                type="number"
                min="0"
                max="2000"
                value={maxJitter}
                onChange={(e) => setMaxJitter(parseInt(e.target.value || '0', 10))}
                className="w-full bg-slate-900 border border-slate-800 rounded-md p-2 text-slate-200 font-mono"
              />
            </div>
          </div>

          {/* Mid-stream drop */}
          <div>
            <label className="font-medium text-slate-300 block mb-1">Drop Stream at Token Index</label>
            <input
              type="number"
              min="1"
              placeholder="e.g. 20 (leave empty for no drop)"
              value={dropAtToken}
              onChange={(e) => setDropAtToken(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-md p-2 text-slate-200 font-mono"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-md shadow-cyan-600/30"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{saving ? 'Applying...' : 'Apply Chaos Settings'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
