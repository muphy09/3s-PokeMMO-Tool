#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function fail(message) {
  console.error(`[telemetry-config] ${message}`);
  process.exit(1);
}

function normalize(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length ? trimmed : '';
}

const config = {};

const installUrl = normalize(process.env.POKEMMO_TOOL_TELEMETRY_URL);
if (!installUrl) {
  fail('POKEMMO_TOOL_TELEMETRY_URL must be provided.');
}
config.POKEMMO_TOOL_TELEMETRY_URL = installUrl;

const optionalKeys = [
  'POKEMMO_TOOL_TELEMETRY_KEY',
  'POKEMMO_TOOL_TELEMETRY_TOKEN',
  'POKEMMO_TOOL_TELEMETRY_STATS_URL',
  'POKEMMO_TOOL_TELEMETRY_STATS_KEY',
  'POKEMMO_TOOL_TELEMETRY_STATS_TOKEN',
];

for (const key of optionalKeys) {
  const value = normalize(process.env[key]);
  if (value) {
    config[key] = value;
  }
}

const repoRoot = path.resolve(__dirname, '..');
const resourcesDir = path.join(repoRoot, 'resources');
const outputPath = path.join(resourcesDir, 'telemetry.config.json');

fs.mkdirSync(resourcesDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

const maskedKeys = Object.keys(config).map((key) => {
  if (!key.endsWith('_KEY') && !key.endsWith('_TOKEN')) return key;
  return `${key} (${config[key].length} chars)`;
});
console.log(`[telemetry-config] wrote telemetry.config.json with keys: ${maskedKeys.join(', ')}`);
