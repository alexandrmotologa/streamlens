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
  await new Promise((r) => setTimeout(r, 1500));

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
    await page.setViewport({ width: 1440, height: 900 });

    const studioUrl = 'http://127.0.0.1:50096/_studio';
    console.log(`Navigating to ${studioUrl}...`);
    await page.goto(studioUrl, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise((r) => setTimeout(r, 800));

    // 1. Capture main overview screenshot (Desktop)
    const overviewPath = path.join(outDir, 'streamlens-overview.png');
    await page.screenshot({ path: overviewPath });
    console.log('✓ Captured streamlens-overview.png');

    // 2. Switch to session with tool calls and capture Request & Prompt tab
    await page.evaluate(() => {
      const select = document.querySelector('select');
      if (select && select.options.length > 0) {
        // The first recorded session was the tool-call session
        select.selectedIndex = select.options.length - 1; // earliest session
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 600));

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const reqBtn = buttons.find((b) => b.textContent?.includes('Request & Prompt'));
      reqBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 500));
    const reqPath = path.join(outDir, 'streamlens-request-inspector.png');
    await page.screenshot({ path: reqPath });
    console.log('✓ Captured streamlens-request-inspector.png');

    // 3. Click "Tool Calls" tab and capture screenshot
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const toolBtn = buttons.find((b) => b.textContent?.includes('Tool Calls'));
      toolBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 500));
    const toolCallsPath = path.join(outDir, 'streamlens-tool-calls.png');
    await page.screenshot({ path: toolCallsPath });
    console.log('✓ Captured streamlens-tool-calls.png');

    // 4. Click "Benchmark Diff" tab and capture screenshot
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const diffBtn = buttons.find((b) => b.textContent?.includes('Benchmark Diff'));
      diffBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 600));
    const diffPath = path.join(outDir, 'streamlens-session-diff.png');
    await page.screenshot({ path: diffPath });
    console.log('✓ Captured streamlens-session-diff.png');

    // 5. Mobile Responsiveness Screenshot (Viewport: 390x844 - iPhone / standard mobile)
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    // Switch to Waterfall view
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const waterBtn = buttons.find((b) => b.textContent?.includes('Token Waterfall'));
      waterBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 500));
    const mobilePath = path.join(outDir, 'streamlens-mobile.png');
    await page.screenshot({ path: mobilePath });
    console.log('✓ Captured streamlens-mobile.png (responsive mobile view)');

    // 6. Reset viewport to desktop and capture animation frames for demo GIF
    await page.setViewport({ width: 1280, height: 800 });
    await new Promise((r) => setTimeout(r, 400));
    console.log('4. Capturing animation frames for demo GIF...');
    let frameIdx = 0;

    // Frames 0-4: Overview Waterfall
    for (let i = 0; i < 5; i++) {
      const framePath = path.join(framesDir, `frame_${String(frameIdx++).padStart(3, '0')}.png`);
      await page.screenshot({ path: framePath });
      await new Promise((r) => setTimeout(r, 80));
    }

    // Switch to Request & Prompt
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const reqBtn = buttons.find((b) => b.textContent?.includes('Request & Prompt'));
      reqBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    for (let i = 0; i < 5; i++) {
      const framePath = path.join(framesDir, `frame_${String(frameIdx++).padStart(3, '0')}.png`);
      await page.screenshot({ path: framePath });
      await new Promise((r) => setTimeout(r, 80));
    }

    // Switch to Tool Calls
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const toolBtn = buttons.find((b) => b.textContent?.includes('Tool Calls'));
      toolBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    for (let i = 0; i < 5; i++) {
      const framePath = path.join(framesDir, `frame_${String(frameIdx++).padStart(3, '0')}.png`);
      await page.screenshot({ path: framePath });
      await new Promise((r) => setTimeout(r, 80));
    }

    // Switch back to Waterfall and trigger live streaming
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

    for (let i = 0; i < 9; i++) {
      const framePath = path.join(framesDir, `frame_${String(frameIdx++).padStart(3, '0')}.png`);
      await page.screenshot({ path: framePath });
      await new Promise((r) => setTimeout(r, 120));
    }

    console.log('5. Compiling animated demo GIF with ffmpeg...');
    const gifOutput = path.join(outDir, 'streamlens_demo.gif');
    const ffmpegCmd = `ffmpeg -y -framerate 6 -i "${path.join(framesDir, 'frame_%03d.png')}" -vf "fps=7,scale=1000:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" "${gifOutput}"`;
    execSync(ffmpegCmd, { stdio: 'inherit' });
    console.log('✓ Generated streamlens_demo.gif successfully!');

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
