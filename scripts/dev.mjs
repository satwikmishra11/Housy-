#!/usr/bin/env node
import { spawn } from 'node:child_process';

console.info('\x1b[36m%s\x1b[0m', 'Starting Housy API backend and Web frontend concurrently...');

const api = spawn('npm', ['run', 'dev:api'], {
  stdio: 'inherit',
  shell: true,
});

const web = spawn('npm', ['run', 'dev:web'], {
  stdio: 'inherit',
  shell: true,
});

function handleExit(code = 0) {
  try {
    api.kill();
    // eslint-disable-next-line no-empty
  } catch {}
  try {
    web.kill();
    // eslint-disable-next-line no-empty
  } catch {}
  process.exit(code);
}

process.on('SIGINT', () => handleExit(0));
process.on('SIGTERM', () => handleExit(0));

api.on('exit', (code) => {
  if (code && code !== 0) {
    console.error(`\x1b[31m[API] Process exited with code ${code}\x1b[0m`);
    handleExit(code);
  }
});

web.on('exit', (code) => {
  if (code && code !== 0) {
    console.error(`\x1b[31m[Web] Process exited with code ${code}\x1b[0m`);
    handleExit(code);
  }
});
