import React, { useState } from 'react';
import { X, ShieldAlert, Check, Play, Pause, SkipForward } from 'lucide-react';
import { ChaosConfig } from '../../../core/types.js';

interface ChaosControlsProps {
  currentChaos: ChaosConfig;
  activeSessionId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: Partial<ChaosConfig>) => Promise<void>;
}

export const ChaosControls: React.FC<ChaosControlsProps> = ({
  currentChaos,
  activeSessionId,
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
  const [steppingMode, setSteppingMode] = useState(currentChaos.steppingMode || false);
  const [pauseAtToken, setPauseAtToken] = useState<string>(
    currentChaos.pauseAtToken ? String(currentChaos.pauseAtToken) : ''
  );
  const [pauseOnToolCall, setPauseOnToolCall] = useState(currentChaos.pauseOnToolCall || false);
  const [saving, setSaving] = useState(false);
  const [stepperStatus, setStepperStatus] = useState<string>('');

  if (!isOpen) return null;

  const handleApplyPreset = (type: 'nginx' | 'jitter' | 'drop' | 'stepping' | 'clean') => {
    switch (type) {
      case 'nginx':
        setEnabled(true);
        setBufferBytes(4096);
        setMinJitter(0);
        setMaxJitter(0);
        setDropAtToken('');
        setSteppingMode(false);
        break;
      case 'jitter':
        setEnabled(true);
        setBufferBytes(0);
        setMinJitter(80);
        setMaxJitter(250);
        setDropAtToken('');
        setSteppingMode(false);
        break;
      case 'drop':
        setEnabled(true);
        setBufferBytes(0);
        setMinJitter(0);
        setMaxJitter(0);
        setDropAtToken('15');
        setSteppingMode(false);
        break;
      case 'stepping':
        setEnabled(true);
        setBufferBytes(0);
        setMinJitter(0);
        setMaxJitter(0);
        setDropAtToken('');
        setSteppingMode(true);
        setPauseOnToolCall(true);
        break;
      case 'clean':
        setEnabled(false);
        setBufferBytes(0);
        setMinJitter(0);
        setMaxJitter(0);
        setDropAtToken('');
        setSteppingMode(false);
        setPauseAtToken('');
        setPauseOnToolCall(false);
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
        dropAtToken: dropAtToken ? parseInt(dropAtToken, 10) : undefined,
        steppingMode,
        pauseAtToken: pauseAtToken ? parseInt(pauseAtToken, 10) : undefined,
        pauseOnToolCall
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleStepChunk = async () => {
    if (!activeSessionId) return;
    try {
      const res = await fetch(`/api/sessions/${activeSessionId}/step`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setStepperStatus(`Stepped 1 chunk! Queued: ${data.queuedCount}`);
      } else {
        setStepperStatus('No active stream paused for this session');
      }
    } catch {
      setStepperStatus('Failed to send step command');
    }
  };

  const handleResumeStream = async () => {
    if (!activeSessionId) return;
    try {
      await fetch(`/api/sessions/${activeSessionId}/resume`, { method: 'POST' });
      setStepperStatus('Stream resumed!');
    } catch {
      setStepperStatus('Failed to resume');
    }
  };

  const handlePauseStream = async () => {
    if (!activeSessionId) return;
    try {
      await fetch(`/api/sessions/${activeSessionId}/pause`, { method: 'POST' });
      setStepperStatus('Stream paused at breakpoint!');
    } catch {
      setStepperStatus('Failed to pause');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4">
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Chaos & Breakpoints Simulation</h2>
              <p className="text-[11px] text-slate-400">Inject proxy buffering, jitter, and step-by-step stream breakpoints</p>
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
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <button
              onClick={() => handleApplyPreset('nginx')}
              className="px-2.5 py-1.5 rounded text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              Nginx 4KB
            </button>
            <button
              onClick={() => handleApplyPreset('jitter')}
              className="px-2.5 py-1.5 rounded text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              High Jitter
            </button>
            <button
              onClick={() => handleApplyPreset('drop')}
              className="px-2.5 py-1.5 rounded text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              Mid-Drop
            </button>
            <button
              onClick={() => handleApplyPreset('stepping')}
              className="px-2.5 py-1.5 rounded text-xs bg-purple-900/50 hover:bg-purple-800 text-purple-200 border border-purple-700 transition"
            >
              Step Mode
            </button>
            <button
              onClick={() => handleApplyPreset('clean')}
              className="px-2.5 py-1.5 rounded text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Active Stream Breakpoint Controls */}
        {activeSessionId && (
          <div className="px-4 py-3 bg-purple-950/20 border-b border-purple-900/40 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-purple-300 font-semibold">
              <span>Interactive Stepper:</span>
              <span className="font-mono text-[11px] text-purple-400 opacity-80">{activeSessionId}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleStepChunk}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-700/80 transition"
                title="Send next token chunk"
              >
                <SkipForward className="w-3 h-3" /> Step
              </button>
              <button
                onClick={handlePauseStream}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-900/60 hover:bg-amber-800 text-amber-200 border border-amber-700/80 transition"
                title="Pause active stream"
              >
                <Pause className="w-3 h-3" /> Pause
              </button>
              <button
                onClick={handleResumeStream}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 border border-emerald-700/80 transition"
                title="Resume full speed"
              >
                <Play className="w-3 h-3" /> Resume
              </button>
            </div>
          </div>
        )}

        {stepperStatus && (
          <div className="px-4 py-1.5 bg-slate-950 text-[11px] text-purple-300 font-mono border-b border-slate-800">
            {stepperStatus}
          </div>
        )}

        {/* Form Body */}
        <div className="p-4 space-y-4 max-h-[50vh] overflow-y-auto text-xs">
          {/* Main Chaos Toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
            />
            <span className="font-semibold text-slate-200">Enable Synthetic Chaos Engine</span>
          </label>

          {/* Proxy Buffering Threshold */}
          <div className="space-y-1">
            <div className="flex justify-between text-slate-300">
              <span>Proxy Buffer Flush Threshold:</span>
              <span className="font-mono text-sky-400 font-bold">{bufferBytes} bytes</span>
            </div>
            <input
              type="range"
              min="0"
              max="16384"
              step="512"
              value={bufferBytes}
              onChange={(e) => setBufferBytes(parseInt(e.target.value, 10))}
              className="w-full accent-sky-500 bg-slate-800"
            />
            <span className="text-[10px] text-slate-500">4096 = Nginx default; 0 = transparent unbuffered</span>
          </div>

          {/* Jitter Min / Max */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-slate-300 block">Min Jitter (ms):</label>
              <input
                type="number"
                min="0"
                max="1000"
                value={minJitter}
                onChange={(e) => setMinJitter(parseInt(e.target.value || '0', 10))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-300 block">Max Jitter (ms):</label>
              <input
                type="number"
                min="0"
                max="2000"
                value={maxJitter}
                onChange={(e) => setMaxJitter(parseInt(e.target.value || '0', 10))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono"
              />
            </div>
          </div>

          {/* Drop At Token */}
          <div className="space-y-1">
            <label className="text-slate-300 block">Mid-Stream Disconnect (Token #):</label>
            <input
              type="number"
              min="1"
              placeholder="Leave empty for uninterrupted stream"
              value={dropAtToken}
              onChange={(e) => setDropAtToken(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono"
            />
          </div>

          {/* Breakpoint Stepping Mode Configuration */}
          <div className="pt-2 border-t border-slate-800 space-y-2.5">
            <span className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider block">
              Stream Breakpoints & Stepper Options
            </span>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={steppingMode}
                onChange={(e) => setSteppingMode(e.target.checked)}
                className="rounded bg-slate-800 border-slate-700 text-purple-500 focus:ring-0"
              />
              <span className="text-slate-300">Launch new streams paused in Step-by-Step mode</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={pauseOnToolCall}
                onChange={(e) => setPauseOnToolCall(e.target.checked)}
                className="rounded bg-slate-800 border-slate-700 text-purple-500 focus:ring-0"
              />
              <span className="text-slate-300">Pause stream breakpoint as soon as a Tool Call starts</span>
            </label>

            <div className="space-y-1">
              <label className="text-slate-300 block">Pause breakpoint at Token #:</label>
              <input
                type="number"
                min="1"
                placeholder="e.g. 10 (Pauses stream at token 10)"
                value={pauseAtToken}
                onChange={(e) => setPauseAtToken(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex justify-end gap-2 bg-slate-950">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-xs bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded flex items-center gap-1.5 transition"
          >
            <Check className="w-3.5 h-3.5" />
            {saving ? 'Applying...' : 'Apply Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
};
