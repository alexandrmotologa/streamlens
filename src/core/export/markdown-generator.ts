import { StreamSession } from '../types.js';

export class MarkdownReportGenerator {
  public static generate(session: StreamSession): string {
    const hasAnomalies = session.bufferingAnomalyDetected || session.anomalies.length > 0;
    const durationSec = session.endTime ? ((session.endTime - session.startTime) / 1000).toFixed(2) : '0';

    let md = `## StreamLens Diagnostic Report: \`${session.sessionId}\`\n\n`;

    if (hasAnomalies) {
      md += `> [!WARNING]
> **Proxy Buffering Anomaly Detected**
> Reverse proxy packet coalescing or high-density burst behavior was flagged during this stream session.
\n`;
    } else {
      md += `> [!NOTE]
> Stream arrived smoothly with consistent inter-token timing.
\n`;
    }

    md += `### Stream Timing & Performance Metrics\n\n`;
    md += `| Metric | Value |\n`;
    md += `| :--- | :--- |\n`;
    md += `| **Target URL** | \`${session.targetUrl}\` |\n`;
    md += `| **Provider** | \`${session.providerType}\` |\n`;
    md += `| **Time to First Token (TTFT)** | **${session.timeToFirstTokenMs} ms** |\n`;
    md += `| **Token Speed** | **${session.tokensPerSecond} tokens/sec** |\n`;
    md += `| **Total Tokens / Bytes** | ${session.totalTokens} tokens (${session.totalBytes} bytes) |\n`;
    md += `| **Average Inter-Token Delta** | ${session.averageInterTokenDeltaMs} ms |\n`;
    md += `| **Jitter Variance (p95)** | ${session.p95TokenJitterMs} ms (max: ${session.maxTokenJitterMs} ms) |\n`;
    md += `| **Stream Duration** | ${durationSec} seconds |\n\n`;

    if (session.anomalies.length > 0) {
      md += `### Detected Anomalies (${session.anomalies.length})\n\n`;
      for (const anom of session.anomalies) {
        md += `- **[${anom.estimatedBufferType}]** ${anom.message} (Idle gap: ${anom.priorIdleGapMs}ms, Burst: ${anom.burstByteLength} bytes)\n`;
      }
      md += `\n`;
    }

    if (session.reasoningContent) {
      md += `### Reasoning / Chain-of-Thought Stream\n\n`;
      md += `**Tokens:** ${session.reasoningTokens} tokens | **Duration:** ${session.reasoningDurationMs || 0} ms\n\n`;
      md += `\`\`\`markdown\n${session.reasoningContent}\n\`\`\`\n\n`;
    }

    if (session.toolCalls.length > 0) {
      md += `### Streaming Tool Calls (${session.toolCalls.length})\n\n`;
      for (const tc of session.toolCalls) {
        md += `#### \`${tc.toolName}()\` [${tc.schemaStatus || 'unvalidated'}]\n`;
        md += `\`\`\`json\n${JSON.stringify(tc.parsedArguments || tc.accumulatedArgumentJson, null, 2)}\n\`\`\`\n\n`;
      }
    }

    if (session.completedContent) {
      md += `### Output Preview\n\n`;
      md += `\`\`\`\n${session.completedContent.slice(0, 500)}${session.completedContent.length > 500 ? '...' : ''}\n\`\`\`\n\n`;
    }

    if (session.request?.curlCommand) {
      md += `### Reproduction cURL\n\n`;
      md += `\`\`\`bash\n${session.request.curlCommand}\n\`\`\`\n`;
    }

    return md;
  }
}
