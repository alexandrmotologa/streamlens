import pc from 'picocolors';
import fs from 'node:fs';
import { StreamReplayEngine } from '../../core/replay/replay-engine.js';
import { printBanner } from '../banner.js';

export async function replayCommand(
  filePath: string,
  options: { port?: string; host?: string; speed?: string }
): Promise<void> {
  printBanner();

  if (!fs.existsSync(filePath)) {
    console.error(pc.red(`Error: Recording file not found at path: ${filePath}`));
    process.exit(1);
  }

  const port = parseInt(options.port || '50087', 10);
  const host = options.host || '127.0.0.1';
  const speed = parseFloat(options.speed || '1.0');

  const engine = new StreamReplayEngine({
    filePath,
    port,
    host,
    speed
  });

  const { url } = await engine.startServer();

  console.log(pc.bold(pc.green('StreamLens Session Replay Server Running:')));
  console.log(`  ${pc.cyan('Source File:')}      ${filePath}`);
  console.log(`  ${pc.cyan('Replay URL:')}       ${url}`);
  console.log(`  ${pc.cyan('Speed Factor:')}     ${speed}x\n`);
  console.log(pc.dim('Connect with any SSE client to replay the captured stream:\n'));
  console.log(pc.white(`  curl -N "${url}"\n`));

  process.on('SIGINT', async () => {
    console.log(pc.yellow('\nStopping replay server...'));
    await engine.stop();
    process.exit(0);
  });
}
