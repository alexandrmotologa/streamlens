import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function buildLogoSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <clipPath id="squircle-clip">
      <rect x="24" y="24" width="976" height="976" rx="220" />
    </clipPath>

    <linearGradient id="cyan-glow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00f5ff" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>

    <linearGradient id="cyan-iris" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#00f5ff" />
    </linearGradient>

    <linearGradient id="amber-accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbbf24" />
      <stop offset="100%" stop-color="#f97316" />
    </linearGradient>

    <filter id="subtle-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#000000" flood-opacity="0.16" />
    </filter>
  </defs>

  <!-- Luxury White Squircle Container -->
  <rect x="24" y="24" width="976" height="976" rx="220" fill="#ffffff" stroke="#e2e8f0" stroke-width="6" />

  <g clip-path="url(#squircle-clip)">
    <g transform="translate(512, 512)" filter="url(#subtle-shadow)">

      <!-- Hexagonal Architectural Gateway -->
      <polygon points="
        0,-390
        338,-195
        338,195
        0,390
        -338,195
        -338,-195
      " fill="none" stroke="#0f172a" stroke-width="40" stroke-linejoin="round" />

      <polygon points="
        0,-355
        307,-177
        307,177
        0,355
        -307,177
        -307,-177
      " fill="none" stroke="#00f5ff" stroke-width="4" opacity="0.45" stroke-dasharray="16, 12" />

      <!-- Symmetrical Sentinel Owl (StreamLens Telemetry Mascot) -->

      <!-- 1. Watertight Solid Base Silhouette (Zero-Leak Rule) -->
      <path d="
        M 0 -220
        L -60 -210
        L -135 -315
        L -160 -260
        L -130 -160
        L -200 -120
        L -245 -30
        L -220 80
        L -160 190
        L -120 270
        L -60 340
        L 0 365
        L 60 340
        L 120 270
        L 160 190
        L 220 80
        L 245 -30
        L 200 -120
        L 130 -160
        L 160 -260
        L 135 -315
        L 60 -210
        Z
      " fill="#0b0f19" />

      <!-- 2. Majestic Ear Tufts / Horns -->
      <!-- Left Tuft -->
      <polygon points="0,-220 -60,-210 -135,-315 -90,-180" fill="#1e293b" />
      <polygon points="-60,-210 -135,-315 -160,-260 -130,-160" fill="#0f172a" />
      <polygon points="-90,-180 -135,-315 -60,-210" fill="#334155" />

      <!-- Right Tuft -->
      <polygon points="0,-220 60,-210 135,-315 90,-180" fill="#334155" />
      <polygon points="60,-210 135,-315 160,-260 130,-160" fill="#1e293b" />
      <polygon points="90,-180 135,-315 60,-210" fill="#475569" />

      <!-- 3. Crown & Forehead Facets -->
      <polygon points="0,-220 -90,-180 0,-120" fill="#334155" />
      <polygon points="0,-220 90,-180 0,-120" fill="#475569" />
      <polygon points="0,-120 -90,-180 -70,-80 0,-55" fill="#1e293b" />
      <polygon points="0,-120 90,-180 70,-80 0,-55" fill="#334155" />

      <!-- 4. Upper Zygomatic Cheek Flares & Facial Disc -->
      <polygon points="-90,-180 -130,-160 -200,-120 -150,-70" fill="#0b0f19" />
      <polygon points="90,-180 130,-160 200,-120 150,-70" fill="#1e293b" />

      <polygon points="-90,-180 -150,-70 -70,-80" fill="#1e293b" />
      <polygon points="90,-180 150,-70 70,-80" fill="#334155" />

      <polygon points="-200,-120 -245,-30 -165,10 -150,-70" fill="#0f172a" />
      <polygon points="200,-120 245,-30 165,10 150,-70" fill="#1e293b" />

      <!-- 5. Alert Geometric Brow Ridges -->
      <polygon points="0,-55 -70,-80 -150,-70 -60,-45" fill="#334155" />
      <polygon points="0,-55 70,-80 150,-70 60,-45" fill="#475569" />

      <!-- 6. Piercing Telemetry Optics (Sharp Almond Eyes with Predatory Cant) -->
      <!-- Left Eye Cavity & Socket -->
      <polygon points="-155,-60 -65,-35 -55,-5 -150,-15" fill="#050811" />
      <!-- Left Eye Sclera / Facet -->
      <polygon points="-148,-52 -75,-32 -65,-8 -142,-18" fill="#0f172a" stroke="#00f5ff" stroke-width="2" stroke-opacity="0.4" />
      <!-- Left Electric Cyan Iris (Almond geometry) -->
      <polygon points="-138,-47 -85,-30 -75,-12 -130,-22" fill="url(#cyan-iris)" />
      <!-- Left Vertical Slit Pupil -->
      <polygon points="-108,-45 -98,-44 -100,-15 -108,-17" fill="#020617" />
      <!-- Specular Highlight Dot -->
      <circle cx="-116" cy="-36" r="3.5" fill="#ffffff" />

      <!-- Right Eye Cavity & Socket (Symmetrical) -->
      <polygon points="155,-60 65,-35 55,-5 150,-15" fill="#050811" />
      <!-- Right Eye Sclera / Facet -->
      <polygon points="148,-52 75,-32 65,-8 142,-18" fill="#0f172a" stroke="#00f5ff" stroke-width="2" stroke-opacity="0.4" />
      <!-- Right Electric Cyan Iris (Almond geometry) -->
      <polygon points="138,-47 85,-30 75,-12 130,-22" fill="url(#cyan-iris)" />
      <!-- Right Vertical Slit Pupil -->
      <polygon points="108,-45 98,-44 100,-15 108,-17" fill="#020617" />
      <!-- Specular Highlight Dot -->
      <circle cx="116" cy="-36" r="3.5" fill="#ffffff" />

      <!-- 7. Geometric Beak (Sharp Culmen & Low-Poly Plates) -->
      <polygon points="0,-55 -28,-30 0,35" fill="#0f172a" />
      <polygon points="0,-55 28,-30 0,35" fill="#1e293b" />

      <!-- Beak Highlight Ridge -->
      <polygon points="0,-55 -8,-25 0,35" fill="#1e293b" />
      <polygon points="0,-55 8,-25 0,35" fill="#334155" />

      <!-- Lower Beak Tip & Mandible -->
      <polygon points="0,35 -20,15 0,60" fill="#334155" />
      <polygon points="0,35 20,15 0,60" fill="#475569" />

      <!-- 8. Facial Lower Disc & Cheeks -->
      <polygon points="-60,-45 -55,-5 0,35 -28,-30" fill="#1e293b" />
      <polygon points="60,-45 55,-5 0,35 28,-30" fill="#334155" />

      <polygon points="-55,-5 -150,-15 -115,55 0,60" fill="#0f172a" />
      <polygon points="55,-5 150,-15 115,55 0,60" fill="#1e293b" />

      <polygon points="-150,-15 -165,10 -220,80 -150,110 -115,55" fill="#0b0f19" />
      <polygon points="150,-15 165,10 220,80 150,110 115,55" fill="#1e293b" />

      <!-- 9. Obsidian Throat Shield & Telemetry Flow Chevrons -->
      <polygon points="0,60 -115,55 -55,145 0,170" fill="#1e293b" />
      <polygon points="0,60 115,55 55,145 0,170" fill="#334155" />

      <polygon points="-115,55 -150,110 -160,190 -95,190 -55,145" fill="#0f172a" />
      <polygon points="115,55 150,110 160,190 95,190 55,145" fill="#1e293b" />

      <!-- Chest Center Keel Facets -->
      <polygon points="0,170 -55,145 -95,190 0,250" fill="#334155" />
      <polygon points="0,170 55,145 95,190 0,250" fill="#475569" />

      <polygon points="-95,190 -160,190 -120,270 -60,280 0,250" fill="#0f172a" />
      <polygon points="95,190 160,190 120,270 60,280 0,250" fill="#1e293b" />

      <polygon points="0,250 -60,280 -60,340 0,365" fill="#1e293b" />
      <polygon points="0,250 60,280 60,340 0,365" fill="#334155" />

      <polygon points="-60,280 -120,270 -60,340" fill="#0b0f19" />
      <polygon points="60,280 120,270 60,340" fill="#1e293b" />

      <!-- 10. Electric Cyan Stream Wave Insets (Representing incoming SSE Token Deliberation) -->
      <polygon points="0,95 -25,120 0,135 25,120" fill="#00f5ff" opacity="0.95" />
      <polygon points="0,185 -22,208 0,222 22,208" fill="#00f5ff" opacity="0.85" />
      <polygon points="0,275 -16,295 0,307 16,295" fill="#00f5ff" opacity="0.7" />

      <!-- Subtle Amber Optic Tuning Accents on Brow Outer Anchors -->
      <polygon points="-155,-60 -150,-70 -130,-65" fill="url(#amber-accent)" opacity="0.9" />
      <polygon points="155,-60 150,-70 130,-65" fill="url(#amber-accent)" opacity="0.9" />

    </g>
  </g>
</svg>`;
}

async function renderLogo(outputDir) {
  const svg = buildLogoSvg();
  const svgPath = path.join(outputDir, 'logo.svg');
  const pngPath = path.join(outputDir, 'logo.png');

  fs.writeFileSync(svgPath, svg);
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } });
  fs.writeFileSync(pngPath, resvg.render().asPng());
  console.log('✓ Successfully rendered logo.svg and logo.png at 1024x1024 in', outputDir);
}

const targetDir = path.resolve(__dirname, '../docs/images');
renderLogo(targetDir).catch((err) => {
  console.error(err);
  process.exit(1);
});
