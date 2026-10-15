import http from 'node:http';
import { MockStreamServer } from '../dist/core/mock/mock-server.js';
import { StreamLensServer } from '../dist/server/local-server.js';

async function sendRequest(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      res.on('data', () => {});
      res.on('end', resolve);
      res.on('error', reject);
    });
  });
}

async function main() {
  const mockServer = new MockStreamServer({ port: 50086 });
  await mockServer.start();
  console.log('Mock server listening on 50086');

  const proxyServer = new StreamLensServer({
    port: 50085,
    target: 'http://127.0.0.1:50086',
    studio: true
  });
  await proxyServer.start();
  console.log('StreamLens Proxy & Studio ready on http://127.0.0.1:50085/_studio');

  // Trigger scenarios to populate sessions
  await sendRequest('http://127.0.0.1:50085/v1/chat/completions?scenario=tool-call');
  await sendRequest('http://127.0.0.1:50085/v1/chat/completions?scenario=nginx-buffered');
  await sendRequest('http://127.0.0.1:50085/v1/chat/completions?scenario=smooth');

  console.log('Initial test streams sent successfully.');
}

main().catch(console.error);
