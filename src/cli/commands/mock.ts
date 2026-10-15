import pc from 'picocolors';
import { MockStreamServer } from '../../core/mock/mock-server.js';
import { MOCK_SCENARIOS } from '../../core/mock/scenarios.js';
import { printBanner } from '../banner.js';

export async function mockCommand(options: {
  port?: string;
  host?: string;
  scenario?: string;
}): Promise<void> {
  printBanner();

  const port = parseInt(options.port || '50086', 10);
  const host = options.host || '127.0.0.1';
  const scenario = options.scenario || 'smooth';

  const mockServer = new MockStreamServer({ port, host });
  const { url } = await mockServer.start();

  console.log(pc.bold(pc.green('StreamLens Mock LLM Server Running:')));
  console.log(`  ${pc.cyan('Mock URL:')}          ${url}`);
  console.log(`  ${pc.cyan('Active Scenario:')}   ${scenario}`);
  console.log(`  ${pc.cyan('Description:')}       ${MOCK_SCENARIOS[scenario]?.description || 'Custom'}\n`);
  console.log(pc.bold('Available Scenarios via ?scenario=<name>:'));
  for (const [name, sc] of Object.entries(MOCK_SCENARIOS)) {
    console.log(`  - ${pc.yellow(name.padEnd(16))} ${pc.dim(sc.description)}`);
  }
  console.log(pc.dim('\nExample test curl:'));
  console.log(pc.white(`  curl -N "${url}/v1/chat/completions?scenario=${scenario}"\n`));

  process.on('SIGINT', async () => {
    console.log(pc.yellow('\nStopping mock server...'));
    await mockServer.stop();
    process.exit(0);
  });
}
