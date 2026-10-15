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
  console.log('1. Starting Mock Server & StreamLens Proxy Server...');
  const mockServer = new MockStreamServer({ port: 50095 });
  await mockServer.start();

  const proxyServer = new StreamLensServer({
    port: 50096,
    target: 'http://127.0.0.1:50095',
    studio: true
  });
  await proxyServer.start();

  console.log('2. Generating test streams...');
  // Scenario 1: Tool call
  await sendRequest('http://127.0.0.1:50096/v1/chat/completions?scenario=tool-call');
  // Scenario 2: Nginx buffer anomaly
  await sendRequest('http://127.0.0.1:50096/v1/chat/completions?scenario=nginx-buffered');
  // Scenario 3: Smooth text
  await sendRequest('http://127.0.0.1:50096/v1/chat/completions?scenario=smooth');

  // Allow sessions to finalize
  await new Promise((r) => setTimeout(r, 1000));

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
    
    // Initial frames showing the dashboard overview
    for (let i = 0; i < 8; i++) {
      const framePath = path.join(framesDir, `frame_${String(i).padStart(3, '0')}.png`);
      await page.screenshot({ path: framePath });
      await new Promise((r) => setTimeout(r, 100));
    }

    // Trigger an active streaming request and capture streaming updates
    sendRequest('http://127.0.0.1:50096/v1/chat/completions?scenario=tool-call').catch(() => {});

    for (let i = 8; i < 24; i++) {
      const framePath = path.join(framesDir, `frame_${String(i).padStart(3, '0')}.png`);
      await page.screenshot({ path: framePath });
      await new Promise((r) => setTimeout(r, 120));
    }

    console.log('5. Compiling animated demo GIF with ffmpeg...');
    const gifOutput = path.join(outDir, 'streamlens_demo.gif');
    const ffmpegCmd = `ffmpeg -y -framerate 8 -i "${path.join(framesDir, 'frame_%03d.png')}" -vf "fps=10,scale=1000:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" "${gifOutput}"`;
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
