import pc from 'picocolors';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import { SSEParser } from '../../core/sse/event-parser.js';
import { printBanner } from '../banner.js';

export async function recordCommand(
  urlStr: string,
  options: { output?: string; method?: string; header?: string[]; data?: string }
): Promise<void> {
  printBanner();

  const outputFile = options.output || 'streamlens-recording.jsonl';
  const targetUrl = new URL(urlStr);
  const isHttps = targetUrl.protocol === 'https:';
  const client = isHttps ? https : http;

  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Accept-Encoding': 'identity'
  };

  if (options.header) {
    for (const h of options.header) {
      const idx = h.indexOf(':');
      if (idx !== -1) {
        headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
      }
    }
  }

  console.log(pc.bold('Recording SSE stream:'));
  console.log(`  ${pc.cyan('Target URL:')}    ${urlStr}`);
  console.log(`  ${pc.cyan('Output File:')}   ${outputFile}\n`);

  // Clear or prepare output file
  fs.writeFileSync(outputFile, '', 'utf-8');

  const parser = new SSEParser({
    onEvent: (msg) => {
      fs.appendFileSync(outputFile, JSON.stringify(msg) + '\n', 'utf-8');
      const deltaStr = `${msg.deltaFromPreviousMs}ms`.padStart(8);
      console.log(
        `${pc.dim(deltaStr)} ${pc.cyan(msg.event.padEnd(12))} ${pc.dim(`(${msg.byteLength}B)`)} ${pc.white(msg.data.slice(0, 60))}`
      );
    }
  });

  const req = client.request(
    targetUrl,
    {
      method: options.method || 'GET',
      headers
    },
    (res) => {
      console.log(pc.green(`Connected (Status ${res.statusCode})\n`));

      res.on('data', (chunk) => {
        parser.feed(chunk);
      });

      res.on('end', () => {
        parser.flush();
        console.log(pc.bold(pc.green(`\nStream ended. Recorded to ${outputFile}\n`)));
        process.exit(0);
      });
    }
  );

  req.on('error', (err) => {
    console.error(pc.red(`Error: ${err.message}`));
    process.exit(1);
  });

  if (options.data) {
    req.write(options.data);
  }

  req.end();
}
