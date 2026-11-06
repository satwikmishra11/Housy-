import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const TDD_MD_PATH = path.resolve(REPO_ROOT, 'docs/TDD.md');
const TDD_PDF_PATH = path.resolve(REPO_ROOT, 'docs/TDD.pdf');

async function exportTddPdf() {
  console.info('Reading docs/TDD.md...');
  let mdContent = fs.readFileSync(TDD_MD_PATH, 'utf-8');

  // Convert all image links in markdown to base64 data URIs
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const matches = [...mdContent.matchAll(imageRegex)];

  for (const match of matches) {
    const rawPath = match[2];
    let resolvedPath = rawPath;
    if (rawPath.startsWith('file://')) {
      resolvedPath = rawPath.replace('file://', '');
    } else if (!path.isAbsolute(rawPath)) {
      resolvedPath = path.resolve(REPO_ROOT, 'docs', rawPath);
    }

    if (fs.existsSync(resolvedPath)) {
      const ext = path.extname(resolvedPath).toLowerCase().replace('.', '');
      const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/svg+xml';
      const b64 = fs.readFileSync(resolvedPath).toString('base64');
      const dataUri = `data:${mime};base64,${b64}`;
      mdContent = mdContent.replace(match[0], `![${match[1]}](${dataUri})`);
    } else {
      console.warn(`Warning: Image file not found at ${resolvedPath}`);
    }
  }

  // Wrap section 10 assumptions list with a multi-column container
  mdContent = mdContent.replace(
    /## 10\. Architectural & Product Assumptions Log[\s\S]*?(?=\n## 11\.)/,
    (match) => {
      const parts = match.split('\n\n');
      const header = parts[0];
      const intro = parts[1];
      const items = parts.slice(2).join('\n\n');
      return `${header}\n\n${intro}\n\n<div class="assumptions-container">\n\n${items}\n\n</div>`;
    }
  );

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Technical Design Document — Housy Real Estate AI Platform</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    @page {
      size: A4;
      margin: 9mm 11mm 11mm 11mm;
    }

    *, *::before, *::after {
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 7.7pt;
      line-height: 1.35;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }

    h1, h2, h3, h4 {
      color: #0f172a;
      page-break-after: avoid;
      break-after: avoid;
    }

    h1 {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 18pt;
      font-weight: 700;
      line-height: 1.15;
      margin-top: 0;
      margin-bottom: 4pt;
      padding-bottom: 3pt;
      border-bottom: 1.5pt solid #b45309;
      color: #0f172a;
    }

    h2 {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 12pt;
      font-weight: 700;
      line-height: 1.2;
      margin-top: 10pt;
      margin-bottom: 3pt;
      padding-bottom: 2pt;
      border-bottom: 0.5pt solid #cbd5e1;
      color: #1e293b;
    }

    h3 {
      font-size: 8.8pt;
      font-weight: 600;
      margin-top: 7pt;
      margin-bottom: 2pt;
      color: #334155;
    }

    h4 {
      font-size: 8.2pt;
      font-weight: 600;
      margin-top: 5pt;
      margin-bottom: 2pt;
      color: #475569;
    }

    p {
      margin-top: 0;
      margin-bottom: 4pt;
    }

    ul, ol {
      margin-top: 0;
      margin-bottom: 4pt;
      padding-left: 12pt;
    }

    li {
      margin-bottom: 1.5pt;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4pt;
      margin-bottom: 6pt;
      font-size: 7.2pt;
      line-height: 1.25;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    th, td {
      padding: 2.5pt 4pt;
      text-align: left;
      border: 0.5pt solid #cbd5e1;
      vertical-align: middle;
    }

    th {
      background-color: #f1f5f9;
      color: #0f172a;
      font-weight: 600;
      font-size: 7.4pt;
    }

    tr:nth-child(even) td {
      background-color: #f8fafc;
    }

    code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 7.2pt;
      background-color: #f1f5f9;
      color: #0f172a;
      padding: 0.5pt 2pt;
      border-radius: 2pt;
      border: 0.5pt solid #e2e8f0;
    }

    pre {
      background-color: #0f172a;
      color: #f8fafc;
      padding: 4pt 6pt;
      border-radius: 2pt;
      overflow-x: auto;
      font-size: 6.8pt;
      line-height: 1.3;
      margin-top: 3pt;
      margin-bottom: 5pt;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    pre code {
      background-color: transparent;
      color: #f8fafc;
      padding: 0;
      border: none;
      font-size: inherit;
    }

    blockquote {
      margin: 4pt 0;
      padding: 3pt 6pt;
      background-color: #fffbeb;
      border-left: 2pt solid #b45309;
      color: #78350f;
      font-size: 7.5pt;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* Diagrams in main text */
    p > img {
      max-height: 180px;
      width: auto;
      max-width: 90%;
      display: block;
      margin: 4pt auto;
      border-radius: 2pt;
      border: 0.5pt solid #cbd5e1;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* Screenshots in tables */
    table td img {
      max-height: 125px;
      width: auto;
      max-width: 100%;
      display: block;
      margin: 1pt auto;
      border-radius: 2pt;
      border: 0.5pt solid #e2e8f0;
    }

    table td {
      text-align: center;
    }

    table td:has(img) {
      padding: 2pt;
      background-color: #ffffff !important;
    }

    hr {
      border: none;
      border-top: 0.5pt solid #e2e8f0;
      margin: 8pt 0;
    }

    a {
      color: #b45309;
      text-decoration: none;
      font-weight: 500;
    }

    /* Multi-column container for assumptions */
    .assumptions-container {
      column-count: 2;
      column-gap: 12pt;
      font-size: 6.8pt;
      line-height: 1.25;
      margin-top: 4pt;
    }

    .assumptions-container ul {
      padding-left: 10pt;
      margin: 0;
    }

    .assumptions-container li {
      margin-bottom: 2pt;
      break-inside: avoid;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  <div id="content"></div>
  <script>
    const rawMarkdown = ${JSON.stringify(mdContent)};
    document.getElementById('content').innerHTML = marked.parse(rawMarkdown);
  </script>
</body>
</html>
  `;

  await page.setContent(htmlContent, { waitUntil: 'networkidle' });
  await page.waitForSelector('#content h1', { timeout: 15000 });
  await page.waitForTimeout(1000);

  console.info('Rendering PDF...');
  await page.pdf({
    path: TDD_PDF_PATH,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '9mm',
      bottom: '10mm',
      left: '11mm',
      right: '11mm',
    },
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="font-family: 'Inter', sans-serif; font-size: 6.5pt; color: #94a3b8; width: 100%; padding: 0 12mm; display: flex; justify-content: space-between; border-bottom: 0.5px solid #e2e8f0; padding-bottom: 2px;">
        <span>Housy Real Estate AI Platform &bull; Technical Design Document</span>
        <span>Ahmedabad Residential Development</span>
      </div>
    `,
    footerTemplate: `
      <div style="font-family: 'Inter', sans-serif; font-size: 6.5pt; color: #94a3b8; width: 100%; padding: 0 12mm; display: flex; justify-content: space-between; border-top: 0.5px solid #e2e8f0; padding-top: 2px;">
        <span>Confidential &bull; Company A</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>
    `,
  });

  await browser.close();
  const stats = fs.statSync(TDD_PDF_PATH);
  console.info(`PDF successfully generated: ${TDD_PDF_PATH} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
}

exportTddPdf().catch((err) => {
  console.error('Failed to export TDD PDF:', err);
  process.exit(1);
});
