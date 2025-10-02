import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

function loadDotEnvPreferTelemetryFile() {
  // If .env.telemetry exists, load it first (dotenv/config already loaded .env)
  const p = path.resolve(process.cwd(), '.env.telemetry');
  if (fs.existsSync(p)) {
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}
loadDotEnvPreferTelemetryFile();

const statsUrl =
  process.env.POKEMMO_TOOL_TELEMETRY_STATS_URL || process.env.POKEMMO_TOOL_TELEMETRY_URL?.replace(/\/install$/, '/stats');

const token =
  process.env.POKEMMO_TOOL_TELEMETRY_STATS_TOKEN ||
  process.env.POKEMMO_TOOL_TELEMETRY_TOKEN ||
  process.env.POKEMMO_TOOL_TELEMETRY_KEY ||
  process.env.POKEMMO_TOOL_TELEMETRY_STATS_KEY;

if (!statsUrl) {
  console.error('No stats URL configured. Set POKEMMO_TOOL_TELEMETRY_STATS_URL or POKEMMO_TOOL_TELEMETRY_URL.');
  process.exit(1);
}
if (!token) {
  console.error('No telemetry token configured. Set POKEMMO_TOOL_TELEMETRY_*_TOKEN or *_KEY.');
  process.exit(1);
}

const resp = await fetch(statsUrl, {
  headers: { Authorization: `Bearer ${token}` }
});
if (!resp.ok) {
  console.error(`Stats request failed: ${resp.status} ${resp.statusText}`);
  const body = await resp.text();
  console.error(body);
  process.exit(1);
}
const data = await resp.json();
const rows = data.rows || [];

// pretty print
if (!rows.length) {
  console.log('No installs recorded yet.');
  process.exit(0);
}

// group + tabular print
const pad = (s, n) => (s + '').padEnd(n);
console.log(pad('OS', 12), pad('Version', 16), pad('Unique Users', 14));
console.log('-'.repeat(44));
const osNames = new Map([
  ['win32', 'Windows'],
  ['darwin', 'Mac']
]);
for (const r of rows) {
  const osLabel = osNames.get(r.os) ?? r.os;
  console.log(pad(osLabel, 12), pad(r.app_version, 16), pad(r.unique_users, 14));
}

// Total Users by Version (all OS combined)
console.log('\n' + '='.repeat(44));
console.log('Total Users by Version (all OS):');
console.log('='.repeat(44));
const byVersion = new Map();
for (const r of rows) {
  const current = byVersion.get(r.app_version) || 0;
  byVersion.set(r.app_version, current + r.unique_users);
}
console.log(pad('Version', 16), pad('Unique Users', 14));
console.log('-'.repeat(32));
const sortedVersions = Array.from(byVersion.entries()).sort((a, b) => {
  const versionA = a[0].split('.').map(Number);
  const versionB = b[0].split('.').map(Number);
  for (let i = 0; i < Math.max(versionA.length, versionB.length); i++) {
    const numA = versionA[i] || 0;
    const numB = versionB[i] || 0;
    if (numA !== numB) return numA - numB;
  }
  return 0;
});
for (const [version, users] of sortedVersions) {
  console.log(pad(version, 16), pad(users, 14));
}

// Total Users by OS (all versions combined)
console.log('\n' + '='.repeat(44));
console.log('Total Users by OS (all versions):');
console.log('='.repeat(44));
const byOS = new Map();
for (const r of rows) {
  const current = byOS.get(r.os) || 0;
  byOS.set(r.os, current + r.unique_users);
}
console.log(pad('OS', 12), pad('Unique Users', 14));
console.log('-'.repeat(28));
let totalUsers = 0;
for (const [os, users] of byOS) {
  const osLabel = osNames.get(os) ?? os;
  console.log(pad(osLabel, 12), pad(users, 14));
  totalUsers += users;
}
console.log('-'.repeat(28));
console.log(pad('Total', 12), pad(totalUsers, 14));
