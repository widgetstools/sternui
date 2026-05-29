#!/usr/bin/env node
/**
 * Generate docs/MARKETSGRID_USAGE_GUIDE.pdf from the markdown source.
 *
 * Usage (from repo root):
 *   node scripts/generate-marketsgrid-usage-guide-pdf.mjs
 *   npm run docs:marketsgrid-usage-pdf
 *
 * Uses pandoc (HTML) + Playwright (print to PDF). Requires `@playwright/test`
 * browsers — run `npx playwright install chromium` once if missing.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const mdPath = join(root, 'docs/MARKETSGRID_USAGE_GUIDE.md');
const cssPath = join(root, 'docs/marketsgrid-usage-guide-pdf.css');
const htmlPath = join(root, 'docs/.MARKETSGRID_USAGE_GUIDE.html');
const pdfPath = join(root, 'docs/MARKETSGRID_USAGE_GUIDE.pdf');

if (!existsSync(mdPath)) {
  console.error(`Missing source: ${mdPath}`);
  process.exit(1);
}

console.log('Converting markdown to HTML…');
execFileSync(
  'pandoc',
  [
    mdPath,
    '--from=markdown',
    '--to=html5',
    '--standalone',
    '--metadata',
    'title=MarketsGrid Usage Guide',
    '--css',
    cssPath,
    '-o',
    htmlPath,
  ],
  { stdio: 'inherit', cwd: root },
);

// Pandoc emits relative css href; inject absolute file URL for Playwright.
const html = readFileSync(htmlPath, 'utf8').replace(
  /href="marketsgrid-usage-guide-pdf\.css"/,
  `href="file://${cssPath}"`,
);
writeFileSync(htmlPath, html, 'utf8');

console.log('Rendering PDF with Playwright…');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    margin: { top: '18mm', right: '16mm', bottom: '18mm', left: '16mm' },
    printBackground: true,
  });
} finally {
  await browser.close();
  unlinkSync(htmlPath);
}

if (!existsSync(pdfPath)) {
  console.error(`Expected PDF at ${pdfPath} was not created.`);
  process.exit(1);
}

console.log('Wrote', pdfPath);
