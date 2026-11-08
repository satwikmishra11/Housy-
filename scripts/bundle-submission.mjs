#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const TDD_PDF_PATH = path.resolve(REPO_ROOT, 'docs/TDD.pdf');
const DEPLOYMENT_MD_PATH = path.resolve(REPO_ROOT, 'deployment.md');
const ZIP_OUT_PATH = path.resolve(REPO_ROOT, 'submission.zip');

console.info('Generating fresh docs/TDD.pdf via scripts/export-tdd-pdf.mjs...');
execSync('node scripts/export-tdd-pdf.mjs', { cwd: REPO_ROOT, stdio: 'inherit' });

if (!fs.existsSync(DEPLOYMENT_MD_PATH)) {
  console.error('ERROR: deployment.md not found at repository root.');
  process.exit(1);
}

const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'housy-submission-'));
fs.copyFileSync(TDD_PDF_PATH, path.join(stagingDir, 'TDD.pdf'));
fs.copyFileSync(DEPLOYMENT_MD_PATH, path.join(stagingDir, 'deployment.md'));

if (fs.existsSync(ZIP_OUT_PATH)) {
  fs.unlinkSync(ZIP_OUT_PATH);
}

execSync(`zip -9 "${ZIP_OUT_PATH}" TDD.pdf deployment.md`, {
  cwd: stagingDir,
  stdio: 'inherit',
});

fs.rmSync(stagingDir, { recursive: true, force: true });

const stats = fs.statSync(ZIP_OUT_PATH);
const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

console.info(`\n✓ Submission package generated at ${ZIP_OUT_PATH}`);
console.info(`✓ Size: ${sizeMb} MB (Strictly under 25 MB limit)`);
console.info(`✓ Contents: TDD.pdf, deployment.md\n`);
