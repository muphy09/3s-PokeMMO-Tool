#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

const scriptPath = path.join(__dirname, 'build-live-helper.ps1');
const psArgs = ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...process.argv.slice(2)];

const candidates = process.platform === 'win32' ? ['pwsh', 'powershell'] : ['pwsh', 'powershell'];
const errors = [];

for (const cmd of candidates) {
  const result = spawnSync(cmd, psArgs, { stdio: 'inherit' });
  if (result.error) {
    if (result.error.code === 'ENOENT') {
      errors.push(`Command '${cmd}' not found.`);
      continue;
    }
    console.error(result.error);
    process.exit(result.status ?? 1);
  }

  if (typeof result.status === 'number') {
    if (result.status === 0) {
      process.exit(0);
    }
    process.exit(result.status);
  }

  // Fallback to exiting with 1 if status is undefined
  process.exit(1);
}

console.error('Unable to locate a compatible PowerShell executable.');
if (errors.length) {
  for (const message of errors) {
    console.error(message);
  }
}
process.exit(1);
