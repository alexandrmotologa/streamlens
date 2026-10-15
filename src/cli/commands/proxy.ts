import pc from 'picocolors';
import { StreamLensServer } from '../../server/local-server.js';
import { ProxyServerOptions, SSEMessage, BufferingAnomaly, StreamingToolCall } from '../../core/types.js';
import { printBanner } from '../banner.js';

export async function proxyCommand(options: {
  port?: string;
  target?: string;
  host?: string;
  chaosBuffer?: string;
  chaosJitterMin?: string;
  chaosJitterMax?: string;
  chaosDropToken?: string;
  record?: string;
  studio?: boolean;
}): Promise<void> {
  printBanner();

  const port = parseInt(options.port || '50085', 10);
  const target = options.target || 'https://api.openai.com';
  const host = options.host || '127.0.0.1';

  const chaosBuffer = options.chaosBuffer ? parseInt(options.chaosBuffer, 10) : 0;
  const chaosJitterMin = options.chaosJitterMin ? parseInt(options.chaosJitterMin, 10) : 0;
  const chaosJitterMax = options.chaosJitterMax ? parseInt(options.chaosJitterMax, 10) : 0;
  const dropAtToken = options.chaosDropToken ? parseInt(options.chaosDropToken, 10) : undefined;

  const chaosEnabled = chaosBuffer > 0 || chaosJitterMin > 0 || chaosJitterMax > 0 || dropAtToken !== undefined;

  const serverOptions: ProxyServerOptions = {
    port,
    host,
    target,
    studio: options.studio ?? true,
    recordFile: options.record,
    chaos: {
      enabled: chaosEnabled,
      bufferThresholdBytes: chaosBuffer,
      minJitterMs: chaosJitterMin,
      maxJitterMs: chaosJitterMax,
      dropAtToken
    }
  };

  const server = new StreamLensServer(serverOptions);

  console.log(pc.bold('StreamLens Proxy Initialized:'));
  console.log(`  ${pc.cyan('Proxy Base URL:')}   http://${host}:${port}`);
  console.log(`  ${pc.cyan('Forward Target:')}   ${target}`);
  console.log(`  ${pc.cyan('Web Studio UI:')}    http://${host}:${port}/_studio`);
  if (chaosEnabled) {
    console.log(pc.yellow(`  ${pc.bold('Chaos Simulation:')} Active (Buffer: ${chaosBuffer}B, Jitter: ${chaosJitterMin}-${chaosJitterMax}ms)`));
  }
  if (options.record) {
    console.log(`  ${pc.green('Recording to:')}     ${options.record}`);
  }
  console.log(pc.dim('\nPoint your LLM client base URL to this proxy to inspect streaming traffic.\n'));

  // Wire CLI terminal visualizer
  const wsHub = (server as unknown as { wsHub: { attach: unknown } });
  server.getForwarder().updateChaosConfig(serverOptions.chaos || {});

  // Start server
  await server.start();

  console.log(pc.dim('Waiting for streaming requests... (Press Ctrl+C to exit)\n'));

  process.on('SIGINT', async () => {
    console.log(pc.yellow('\nShutting down StreamLens...'));
    await server.stop();
    process.exit(0);
  });
}
