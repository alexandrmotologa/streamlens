import { Command } from 'commander';
import { proxyCommand } from './commands/proxy.js';
import { mockCommand } from './commands/mock.js';
import { replayCommand } from './commands/replay.js';
import { recordCommand } from './commands/record.js';
import { studioCommand } from './commands/studio.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('streamlens')
    .description('Server-Sent Events (SSE) & LLM Token Stream Inspector with Real-Time Tool-Call JSON Reconstruction')
    .version('0.1.0');

  program
    .command('proxy')
    .description('Start the transparent LLM reverse proxy and embedded Web Studio')
    .option('-p, --port <number>', 'Proxy server port (default: 50085)', '50085')
    .option('-t, --target <url>', 'Upstream target API base URL (default: https://api.openai.com)', 'https://api.openai.com')
    .option('--host <host>', 'Host to bind server to (default: 127.0.0.1)', '127.0.0.1')
    .option('--chaos-buffer <bytes>', 'Simulate proxy buffering threshold in bytes (e.g. 4096 for Nginx)', '0')
    .option('--chaos-jitter-min <ms>', 'Minimum injected inter-token jitter in ms', '0')
    .option('--chaos-jitter-max <ms>', 'Maximum injected inter-token jitter in ms', '0')
    .option('--chaos-drop-token <number>', 'Simulate mid-stream connection drop after N tokens')
    .option('-r, --record <file>', 'Automatically record all streaming sessions to JSONL file')
    .action(proxyCommand);

  program
    .command('mock')
    .description('Start local mock LLM SSE server generating realistic stream scenarios')
    .option('-p, --port <number>', 'Mock server port (default: 50086)', '50086')
    .option('--host <host>', 'Host to bind server to (default: 127.0.0.1)', '127.0.0.1')
    .option('-s, --scenario <name>', 'Default scenario: smooth, nginx-buffered, jitter, tool-call, interrupted', 'smooth')
    .action(mockCommand);

  program
    .command('replay <file>')
    .description('Replay a previously captured .jsonl session stream over a local SSE endpoint')
    .option('-p, --port <number>', 'Replay server port (default: 50087)', '50087')
    .option('--host <host>', 'Host to bind server to (default: 127.0.0.1)', '127.0.0.1')
    .option('--speed <factor>', 'Replay speed multiplier (default: 1.0)', '1.0')
    .action(replayCommand);

  program
    .command('record <url>')
    .description('Record an active SSE streaming URL to a JSONL file')
    .option('-o, --output <file>', 'Output JSONL file (default: streamlens-recording.jsonl)', 'streamlens-recording.jsonl')
    .option('-X, --method <method>', 'HTTP method (default: GET)', 'GET')
    .option('-H, --header <header...>', 'Custom request headers (e.g. -H "Authorization: Bearer ...")')
    .option('-d, --data <data>', 'Request body data')
    .action(recordCommand);

  program
    .command('studio')
    .description('Launch embedded React 19 Web Studio dashboard standalone')
    .option('-p, --port <number>', 'Studio server port (default: 50085)', '50085')
    .option('--host <host>', 'Host to bind server to (default: 127.0.0.1)', '127.0.0.1')
    .action(studioCommand);

  return program;
}

export function run(): void {
  process.on('uncaughtException', (err: Error & { code?: string }) => {
    if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') {
      // Ignore client aborts or transient pipe terminations
      return;
    }
    console.error('[StreamLens] Uncaught exception:', err.message || err);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[StreamLens] Unhandled rejection:', reason);
  });

  const program = createProgram();
  program.parse(process.argv);
  if (process.argv.length <= 2) {
    program.help();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}
