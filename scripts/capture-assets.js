import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { MockStreamServer } from '../dist/core/mock/mock-server.js';
import { StreamLensServer } from '../dist/server/local-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outDir = path.resolve(rootDir, 'docs/images');
const framesDir = path.resolve(rootDir, 'docs/images/frames');

if (!fs.existsSync(framesDir)) {
  fs.mkdirSync(framesDir, { recursive: true });
}

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function sendPostRequest(url, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          Authorization: 'Bearer sk-proj-1234567890abcdef'
        }
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', resolve);
        res.on('error', reject);
      }
    );
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('1. Starting Mock Server & StreamLens Proxy Server...');
  const mockServer = new MockStreamServer({ port: 50095 });
  await mockServer.start();

  const proxyServer = new StreamLensServer({
    port: 50096,
    target: 'http://127.0.0.1:50095',
    studio: true
  });
  await proxyServer.start();

  console.log('2. Generating test streams with rich metadata...');
  // Scenario 1: Tool call with full request body & schemas
  await sendPostRequest('http://127.0.0.1:50096/v1/chat/completions?scenario=tool-call', {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are an internal database agent inspecting user permission tables.' },
      { role: 'user', content: 'Find all active admin users in the database and return the top 25.' }
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'query_database',
          description: 'Queries internal databases for active user records',
          parameters: {
            type: 'object',
            properties: {
              table: { type: 'string' },
              filter: { type: 'object' },
              limit: { type: 'integer' }
            },
            required: ['table', 'filter', 'limit']
          }
        }
      }
    ]
  });

  // Scenario 2: DeepSeek reasoning CoT
  await sendPostRequest('http://127.0.0.1:50096/v1/chat/completions?scenario=deepseek-reasoning', {
    model: 'deepseek-r1',
    messages: [
      { role: 'user', content: 'How do I fix proxy buffering in Nginx when streaming LLM responses?' }
    ]
  });

  // Scenario 3: Nginx 4KB buffer anomaly
  await sendPostRequest('http://127.0.0.1:50096/v1/chat/completions?scenario=nginx-buffered', {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Stream a large payload.' }]
  });

  // Allow sessions to finalize
  await new Promise((r) => setTimeout(r, 1200));

  console.log('3. Launching Chrome with puppeteer-core...');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const studioUrl = 'http://127.0.0.1:50096/_studio';
    console.log(`Navigating to ${studioUrl}...`);
    await page.goto(studioUrl, { waitUntil: 'networkidle0', timeout: 15000 });

    // Capture main overview screenshot
    const overviewPath = path.join(outDir, 'streamlens-overview.png');
    await page.screenshot({ path: overviewPath });
    console.log('Captured streamlens-overview.png successfully.');

    // Capture animation frames for animated GIF
    console.log('4. Capturing animation frames for demo GIF...');
    let frameIdx = 0;

    // Frames 0-5: Waterfall tab overview
    for (let i = 0; i < 6; i++) {
      const framePath = path.join(framesDir, `frame_${String(frameIdx++).padStart(3, '0')}.png`);
      await page.screenshot({ path: framePath });
      await new Promise((r) => setTimeout(r, 80));
    }

    // Click "Request & Prompt" tab
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const reqBtn = buttons.find((b) => b.textContent?.includes('Request & Prompt'));
      reqBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    // Frames: Request inspector view
    for (let i = 0; i < 6; i++) {
      const framePath = path.join(framesDir, `frame_${String(frameIdx++).padStart(3, '0')}.png`);
      await page.screenshot({ path: framePath });
      await new Promise((r) => setTimeout(r, 80));
    }

    // Click "Tool Calls" tab
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const toolBtn = buttons.find((b) => b.textContent?.includes('Tool Calls'));
      toolBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    // Frames: Tool calls view
    for (let i = 0; i < 6; i++) {
      const framePath = path.join(framesDir, `frame_${String(frameIdx++).padStart(3, '0')}.png`);
      await page.screenshot({ path: framePath });
      await new Promise((r) => setTimeout(r, 80));
    }

    // Switch back to Waterfall and trigger an active stream
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const waterBtn = buttons.find((b) => b.textContent?.includes('Token Waterfall'));
      waterBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 200));

    // Trigger an active streaming request
    sendPostRequest('http://127.0.0.1:50096/v1/chat/completions?scenario=tool-call', {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Stream tool call' }]
    }).catch(() => {});

    for (let i = 0; i < 10; i++) {
      const framePath = path.join(framesDir, `frame_${String(frameIdx++).padStart(3, '0')}.png`);
      await page.screenshot({ path: framePath });
      await new Promise((r) => setTimeout(r, 120));
    }

    console.log('5. Compiling animated demo GIF with ffmpeg...');
    const gifOutput = path.join(outDir, 'streamlens_demo.gif');
    const ffmpegCmd = `ffmpeg -y -framerate 6 -i "${path.join(framesDir, 'frame_%03d.png')}" -vf "fps=8,scale=1000:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" "${gifOutput}"`;
    execSync(ffmpegCmd, { stdio: 'inherit' });
    console.log('Generated streamlens_demo.gif successfully!');

    // Cleanup frames directory
    fs.rmSync(framesDir, { recursive: true, force: true });
  } finally {
    await browser.close();
    await proxyServer.stop();
    await mockServer.stop();
    console.log('All servers stopped and browser closed.');
  }
}

main().catch((err) => {
  console.error('Asset capture failed:', err);
  process.exit(1);
});
