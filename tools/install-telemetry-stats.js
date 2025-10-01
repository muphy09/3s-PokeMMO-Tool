#!/usr/bin/env node
/* eslint-disable no-console */

function normalizeVersion(ver) {
  return String(ver || '').trim().replace(/^v/i, '');
}

function formatPlatform(platform = '') {
  const value = String(platform || '').toLowerCase();
  if (value.startsWith('win')) return 'windows';
  if (value.startsWith('mac') || value.startsWith('darwin')) return 'mac';
  if (value.startsWith('linux')) return 'linux';
  return value || 'unknown';
}

function coalesceRows(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.rows)) return input.rows;
  if (Array.isArray(input?.data)) return input.data;
  return [];
}

function ensureBearer(token) {
  if (!token) return null;
  return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}

function parseTimestamp(value) {
  if (!value) return Number.NaN;
  const time = Date.parse(value);
  if (!Number.isNaN(time)) return time;
  if (typeof value === 'number') {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return Number.NaN;
}

function compareVersions(a, b) {
  const pa = normalizeVersion(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = normalizeVersion(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function main() {
  const args = process.argv.slice(2);
  const outputJson = args.includes('--json');

  const postEndpoint = process.env.POKEMMO_TOOL_TELEMETRY_URL;
  const statsEndpointEnv = process.env.POKEMMO_TOOL_TELEMETRY_STATS_URL;

  if (!postEndpoint && !statsEndpointEnv) {
    console.error('POKEMMO_TOOL_TELEMETRY_STATS_URL (or POKEMMO_TOOL_TELEMETRY_URL) must be set.');
    process.exitCode = 1;
    return;
  }

  let statsUrl = statsEndpointEnv;
  if (!statsUrl && postEndpoint) {
    try {
      const base = new URL(postEndpoint);
      base.pathname = base.pathname.replace(/\/*$/, '/');
      statsUrl = new URL('stats', base).toString();
    } catch (err) {
      console.error('Unable to derive stats endpoint from POKEMMO_TOOL_TELEMETRY_URL:', err?.message || err);
      process.exitCode = 1;
      return;
    }
  }

  if (!statsUrl) {
    console.error('Telemetry stats endpoint could not be determined.');
    process.exitCode = 1;
    return;
  }

  if (typeof fetch !== 'function') {
    console.error('Global fetch API unavailable in this Node runtime.');
    process.exitCode = 1;
    return;
  }

  const headers = { Accept: 'application/json' };
  const authToken = ensureBearer(
    process.env.POKEMMO_TOOL_TELEMETRY_STATS_KEY
      || process.env.POKEMMO_TOOL_TELEMETRY_KEY
      || process.env.POKEMMO_TOOL_TELEMETRY_TOKEN,
  );
  if (authToken) headers.Authorization = authToken;

  let response;
  try {
    response = await fetch(statsUrl, { headers });
  } catch (err) {
    console.error('Telemetry stats request failed:', err?.message || err);
    process.exitCode = 1;
    return;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error(`Telemetry stats responded with HTTP ${response.status} ${response.statusText}${text ? `: ${text}` : ''}`);
    process.exitCode = 1;
    return;
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    console.error('Unable to parse telemetry response as JSON:', err?.message || err);
    process.exitCode = 1;
    return;
  }

  const rows = coalesceRows(data);

  const aggregateGroups = new Map();
  const installs = new Map();

  let rowIndex = 0;
  for (const row of rows) {
    rowIndex += 1;
    if (!row) continue;
    const rawPlatform = row.platform || row.os || row.osName || row.operatingSystem;
    const platform = formatPlatform(rawPlatform);
    const version = normalizeVersion(row.version || row.appVersion || row.release || row.tag);
    if (!platform || !version) continue;

    const count = typeof row.count === 'number' ? row.count : null;
    const installId = row.installId || row.id || row.uuid || row.install_id;

    if (!installId) {
      const key = `${platform}__${version}`;
      if (!aggregateGroups.has(key)) {
        aggregateGroups.set(key, { platform, version, count: 0 });
      }
      if (count != null) {
        aggregateGroups.get(key).count += count;
      } else {
        aggregateGroups.get(key).count += 1;
      }
      continue;
    }

    const seenAt = parseTimestamp(row.lastSeen || row.updatedAt || row.timestamp || row.seenAt || row.createdAt);
    const existing = installs.get(installId);
    const candidate = {
      platform,
      version,
      seenAt,
      order: rowIndex,
    };

    if (!existing) {
      installs.set(installId, candidate);
      continue;
    }

    const existingHasTime = Number.isFinite(existing.seenAt);
    const candidateHasTime = Number.isFinite(seenAt);

    if (candidateHasTime && !existingHasTime) {
      installs.set(installId, candidate);
      continue;
    }

    if (candidateHasTime && existingHasTime) {
      if (seenAt > existing.seenAt) {
        installs.set(installId, candidate);
      }
      continue;
    }

    const versionDiff = compareVersions(candidate.version, existing.version);
    if (versionDiff > 0) {
      installs.set(installId, candidate);
      continue;
    }
    if (versionDiff === 0 && candidate.order > existing.order) {
      installs.set(installId, candidate);
    }
  }

  const groups = new Map();

  for (const { platform, version } of installs.values()) {
    const key = `${platform}__${version}`;
    if (!groups.has(key)) {
      groups.set(key, { platform, version, count: 0 });
    }
    groups.get(key).count += 1;
  }

  for (const value of aggregateGroups.values()) {
    const key = `${value.platform}__${value.version}`;
    if (!groups.has(key)) {
      groups.set(key, { platform: value.platform, version: value.version, count: 0 });
    }
    groups.get(key).count += value.count;
  }

  const output = [];
  for (const value of groups.values()) {
    output.push({ platform: value.platform, version: value.version, installs: value.count });
  }

  output.sort((a, b) => {
    if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
    const verA = a.version.split('.').map(n => parseInt(n, 10) || 0);
    const verB = b.version.split('.').map(n => parseInt(n, 10) || 0);
    const len = Math.max(verA.length, verB.length);
    for (let i = 0; i < len; i += 1) {
      const diff = (verB[i] || 0) - (verA[i] || 0);
      if (diff) return diff;
    }
    return 0;
  });

  if (outputJson) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  const totals = new Map();
  let grandTotal = 0;
  for (const item of output) {
    grandTotal += item.installs;
    totals.set(item.platform, (totals.get(item.platform) || 0) + item.installs);
  }

  const pad = (str, len) => String(str).padEnd(len);
  const rowsToPrint = [];
  const header = [pad('Platform', 10), pad('Version', 10), pad('Installs', 8)].join('  ');
  rowsToPrint.push(header);
  rowsToPrint.push('-'.repeat(header.length));

  for (const item of output) {
    rowsToPrint.push([
      pad(item.platform, 10),
      pad(item.version, 10),
      pad(item.installs, 8),
    ].join('  '));
  }

  rowsToPrint.push('');
  rowsToPrint.push('Totals by platform:');
  for (const [platform, count] of [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    rowsToPrint.push(`  ${pad(platform, 10)} ${count}`);
  }
  rowsToPrint.push(`Grand total: ${grandTotal}`);

  console.log(rowsToPrint.join('\n'));
}

main().catch((err) => {
  console.error('Unexpected telemetry stats failure:', err?.message || err);
  process.exitCode = 1;
});
