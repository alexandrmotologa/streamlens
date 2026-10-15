/**
 * StreamLens Test Client Example
 * Demonstrates streaming LLM completions through the local StreamLens proxy.
 *
 * Usage:
 *   npx tsx examples/test-client.ts
 */

async function main() {
  const proxyUrl = 'http://127.0.0.1:50085/v1/chat/completions?scenario=tool-call';

  console.log('Connecting to StreamLens Proxy at:', proxyUrl);

  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer demo-key'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      stream: true,
      messages: [{ role: 'user', content: 'Query user database' }]
    })
  });

  if (!response.body) {
    console.error('No response body received');
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  console.log('\n--- Incoming Stream Chunks ---\n');

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    process.stdout.write(chunk);
  }

  console.log('\n\n--- Stream Completed ---\n');
}

main().catch(console.error);
