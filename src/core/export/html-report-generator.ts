import { StreamSession } from '../types.js';

export class HtmlReportGenerator {
  public static generate(session: StreamSession): string {
    const hasAnomalies = session.bufferingAnomalyDetected || session.anomalies.length > 0;
    const durationMs = session.endTime ? session.endTime - session.startTime : 0;

    const messagesListHtml = session.request?.messages
      ? session.request.messages
          .map((m) => {
            const roleColor =
              m.role === 'system'
                ? 'border-purple-500/40 bg-purple-950/20 text-purple-300'
                : m.role === 'user'
                ? 'border-blue-500/40 bg-blue-950/20 text-blue-300'
                : m.role === 'assistant'
                ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300'
                : 'border-amber-500/40 bg-amber-950/20 text-amber-300';
            return `
        <div style="margin-bottom: 12px; border-left: 3px solid; padding: 8px 12px; border-radius: 4px; background: rgba(255,255,255,0.03);" class="${roleColor}">
          <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; opacity: 0.8; margin-bottom: 4px;">${this.escape(m.role)}</div>
          <div style="white-space: pre-wrap; font-family: inherit; font-size: 13px;">${this.escape(m.content)}</div>
        </div>
      `;
          })
          .join('')
      : '<div style="color: #64748b; font-style: italic;">No request messages captured.</div>';

    const toolsHtml = session.toolCalls.length > 0
      ? session.toolCalls
          .map((tc) => {
            const statusBadge =
              tc.schemaStatus === 'valid'
                ? '<span style="background: rgba(16,185,129,0.2); color: #34d399; padding: 2px 8px; border-radius: 9999px; font-size: 11px;">Schema Valid</span>'
                : tc.schemaStatus === 'invalid'
                ? '<span style="background: rgba(239,68,68,0.2); color: #f87171; padding: 2px 8px; border-radius: 9999px; font-size: 11px;">Schema Invalid</span>'
                : '<span style="background: rgba(234,179,8,0.2); color: #facc15; padding: 2px 8px; border-radius: 9999px; font-size: 11px;">Assembling</span>';
            return `
        <div style="background: #111827; border: 1px solid #1f2937; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div style="font-weight: 600; color: #60a5fa; font-family: monospace;">${this.escape(tc.toolName)}()</div>
            <div>${statusBadge}</div>
          </div>
          <pre style="background: #030712; padding: 10px; border-radius: 6px; overflow-x: auto; color: #e2e8f0; font-size: 12px; margin: 0;">${this.escape(JSON.stringify(tc.parsedArguments || tc.accumulatedArgumentJson, null, 2))}</pre>
        </div>
      `;
          })
          .join('')
      : '<div style="color: #64748b; font-style: italic;">No streaming tool calls in this session.</div>';

    const eventsRows = session.messages
      .slice(0, 200)
      .map((msg, i) => {
        const deltaColor =
          msg.deltaFromPreviousMs > 150 ? '#ef4444' : msg.deltaFromPreviousMs < 2 ? '#a855f7' : '#10b981';
        return `
        <tr style="border-bottom: 1px solid #1f2937;">
          <td style="padding: 6px 12px; font-family: monospace; color: #94a3b8;">#${i + 1}</td>
          <td style="padding: 6px 12px; font-family: monospace; color: ${deltaColor};">${msg.deltaFromPreviousMs} ms</td>
          <td style="padding: 6px 12px; font-family: monospace; color: #94a3b8;">${msg.byteLength} B</td>
          <td style="padding: 6px 12px; font-family: monospace; color: #38bdf8;">${this.escape(msg.event || 'message')}</td>
          <td style="padding: 6px 12px; font-family: monospace; max-width: 500px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #e2e8f0;">${this.escape(msg.data)}</td>
        </tr>
      `;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StreamLens Diagnostic Report - ${this.escape(session.sessionId)}</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      background: #090d16;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
    }
    .container {
      max-width: 1100px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 16px;
      border-bottom: 1px solid #1e293b;
      margin-bottom: 24px;
    }
    .title {
      font-size: 24px;
      font-weight: 700;
      color: #38bdf8;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .card {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 16px;
    }
    .card-title {
      font-size: 12px;
      color: #94a3b8;
      text-transform: uppercase;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .card-value {
      font-size: 22px;
      font-weight: 700;
      font-family: monospace;
      color: #f8fafc;
    }
    .section {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 24px;
    }
    .section-title {
      font-size: 16px;
      font-weight: 700;
      color: #cbd5e1;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th {
      text-align: left;
      padding: 8px 12px;
      background: #1e293b;
      color: #94a3b8;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="title">
          <span>StreamLens</span> Diagnostic Report
        </div>
        <div style="font-size: 13px; color: #64748b; font-family: monospace;">Session: ${this.escape(session.sessionId)} • Target: ${this.escape(session.targetUrl)}</div>
      </div>
      <div>
        ${
          hasAnomalies
            ? '<span class="badge" style="background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.4);">⚠️ Buffering Anomaly Detected</span>'
            : '<span class="badge" style="background: rgba(16,185,129,0.2); color: #34d399; border: 1px solid rgba(16,185,129,0.4);">✓ Healthy Stream Flow</span>'
        }
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-title">Time to First Token</div>
        <div class="card-value" style="color: #38bdf8;">${session.timeToFirstTokenMs} ms</div>
      </div>
      <div class="card">
        <div class="card-title">Token Speed</div>
        <div class="card-value" style="color: #10b981;">${session.tokensPerSecond} tps</div>
      </div>
      <div class="card">
        <div class="card-title">Total Tokens / Bytes</div>
        <div class="card-value">${session.totalTokens} <span style="font-size: 13px; color: #94a3b8;">(${session.totalBytes} B)</span></div>
      </div>
      <div class="card">
        <div class="card-title">Inter-Token Jitter (p95)</div>
        <div class="card-value" style="color: ${session.p95TokenJitterMs > 100 ? '#f59e0b' : '#34d399'};">${session.p95TokenJitterMs} ms</div>
      </div>
      <div class="card">
        <div class="card-title">Duration</div>
        <div class="card-value">${(durationMs / 1000).toFixed(2)} s</div>
      </div>
    </div>

    ${
      session.reasoningContent
        ? `
    <div class="section">
      <div class="section-title">
        <span>🧠 Reasoning & Thought Process (Chain-of-Thought)</span>
        <span style="font-size: 12px; font-weight: normal; color: #a855f7;">${session.reasoningTokens} tokens</span>
      </div>
      <div style="background: rgba(168,85,247,0.06); border: 1px solid rgba(168,85,247,0.2); border-radius: 8px; padding: 14px; font-family: monospace; font-size: 13px; white-space: pre-wrap; color: #d8b4fe;">${this.escape(session.reasoningContent)}</div>
    </div>
    `
        : ''
    }

    <div class="section">
      <div class="section-title">💬 Completed Content Output</div>
      <div style="background: #030712; border: 1px solid #1f2937; border-radius: 8px; padding: 16px; font-size: 14px; white-space: pre-wrap; color: #f8fafc;">${this.escape(session.completedContent || '(No text content generated)')}</div>
    </div>

    <div class="section">
      <div class="section-title">🔧 Streaming Tool Calls (${session.toolCalls.length})</div>
      <div>${toolsHtml}</div>
    </div>

    <div class="section">
      <div class="section-title">📨 Request & Conversation History</div>
      <div>${messagesListHtml}</div>
      ${
        session.request?.curlCommand
          ? `
        <div style="margin-top: 14px;">
          <div style="font-size: 12px; color: #94a3b8; margin-bottom: 4px; font-weight: 600;">Reproduce with cURL:</div>
          <pre style="background: #030712; padding: 10px; border-radius: 6px; overflow-x: auto; font-size: 12px; color: #a7f3d0; margin: 0;">${this.escape(session.request.curlCommand)}</pre>
        </div>
      `
          : ''
      }
    </div>

    <div class="section">
      <div class="section-title">⚡ Raw SSE Chunks (${session.messages.length})</div>
      <div style="overflow-x: auto;">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Delta</th>
              <th>Size</th>
              <th>Event</th>
              <th>Payload Preview</th>
            </tr>
          </thead>
          <tbody>
            ${eventsRows}
          </tbody>
        </table>
      </div>
    </div>

    <div style="text-align: center; color: #64748b; font-size: 12px; margin-top: 40px; border-top: 1px solid #1e293b; padding-top: 20px;">
      Generated by StreamLens • Server-Sent Events & LLM Token Stream Inspector
    </div>
  </div>
</body>
</html>`;
  }

  private static escape(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
