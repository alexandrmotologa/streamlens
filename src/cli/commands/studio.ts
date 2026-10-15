import pc from 'picocolors';
import { StreamLensServer } from '../../server/local-server.js';
import { printBanner } from '../banner.js';

export async function studioCommand(options: { port?: string; host?: string }): Promise<void> {
  printBanner();

  const port = parseInt(options.port || '50085', 10);
  const host = options.host || '127.0.0.1';

  const server = new StreamLensServer({
    port,
    host,
    target: 'http://127.0.0.1:50086', // Fallback to mock port
    studio: true
  });

  const { studioUrl } = await server.start();

  console.log(pc.bold(pc.green('StreamLens Web Studio Ready:')));
  console.log(`  ${pc.cyan('Dashboard URL:')}   ${studioUrl}\n`);
  console.log(pc.dim('Open the URL in your browser to inspect sessions and test stream scenarios.\n'));

  process.on('SIGINT', async () => {
    console.log(pc.yellow('\nShutting down Studio...'));
    await server.stop();
    process.exit(0);
  });
}
