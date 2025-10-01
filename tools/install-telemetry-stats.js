#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const TOOL_PREFIX = '3s-PokeMMO-Tool-';
const GITHUB_API_BASE = 'https://api.github.com';

function loadLocalEnv() {
  const repoRoot = path.resolve(__dirname, '..');
  const candidateFiles = [
    path.join(repoRoot, '.env.telemetry'),
    path.join(repoRoot, '.env'),
  ];

  for (const file of candidateFiles) {
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    for (const line of raw.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
      let value = line.slice(idx + 1).trim();
      if (value.length >= 2) {
        const first = value[0];
        const last = value[value.length - 1];
        if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
          value = value.slice(1, -1);
        }
      }
      process.env[key] = value;
    }
    break;
  }
}

loadLocalEnv();

function getFallbackMode() {
  return (process.env.POKEMMO_TOOL_TELEMETRY_FALLBACK || 'github').trim().toLowerCase();
}

function getGithubOwner() {
  return (process.env.POKEMMO_TOOL_TELEMETRY_GITHUB_OWNER || 'muphy09').trim() || 'muphy09';
}

function getGithubRepo() {
  return (process.env.POKEMMO_TOOL_TELEMETRY_GITHUB_REPO || '3s-PokeMMO-Tool').trim() || '3s-PokeMMO-Tool';
}

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

function extractExtension(name) {
  if (!name) return '';
  const lower = name.toLowerCase();
  const multi = ['.tar.gz', '.tar.xz', '.tar.bz2'];
  for (const ext of multi) {
    if (lower.endsWith(ext)) return ext;
  }
  return path.extname(lower);
}

function shouldSkipAssetName(name) {
  if (!name) return true;
  const lower = name.toLowerCase();
  if (lower.endsWith('.blockmap')) return true;
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return true;
  if (lower.endsWith('.json')) return true;
  if (!lower.startsWith(TOOL_PREFIX.toLowerCase())) return true;
  return false;
}

function parseGithubAsset(asset) {
  if (!asset || typeof asset.name !== 'string') return null;
  const name = asset.name.trim();
  if (shouldSkipAssetName(name)) return null;

  const remainder = name.slice(TOOL_PREFIX.length);
  const lowerRemainder = remainder.toLowerCase();

  let platform = null;
  let versionPart = '';
  for (const candidate of ['win', 'mac', 'linux']) {
    const marker = `-${candidate}-`;
    const idx = lowerRemainder.indexOf(marker);
    if (idx !== -1) {
      platform = candidate;
      versionPart = remainder.slice(0, idx);
      break;
    }
  }

  if (!platform || !versionPart) return null;

  const ext = extractExtension(name);
  const allowedExts = new Set(['.exe', '.zip', '.appimage', '.dmg', '.tar.gz', '.tar.xz']);
  if (!allowedExts.has(ext)) return null;

  const count = Number(asset.download_count) || 0;
  return {
    platform: formatPlatform(platform),
    version: normalizeVersion(versionPart),
    count,
  };
}

async function loadGithubDownloadRows(owner = getGithubOwner(), repo = getGithubRepo()) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'pokemmo-telemetry-stats',
  };

  const token = ensureBearer(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.POKEMMO_TOOL_GITHUB_TOKEN);
  if (token) headers.Authorization = token;

  const perPage = 100;
  let page = 1;
  const releases = [];

  while (true) {
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/releases?per_page=${perPage}&page=${page}`;
    let response;
    try {
      response = await fetch(url, { headers });
    } catch (err) {
      throw new Error(`GitHub releases request failed: ${err?.message || err}${collectErrorDetails(err)}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`GitHub releases responded with HTTP ${response.status} ${response.statusText}${text ? `: ${text}` : ''}`);
    }

    let pageData;
    try {
      pageData = await response.json();
    } catch (err) {
      throw new Error(`Unable to parse GitHub releases JSON: ${err?.message || err}`);
    }

    if (!Array.isArray(pageData) || pageData.length === 0) break;
    releases.push(...pageData);
    if (pageData.length < perPage) break;
    page += 1;
  }

  if (!releases.length) {
    throw new Error('No releases returned by the GitHub API.');
  }

  const rows = [];
  for (const release of releases) {
    if (!Array.isArray(release?.assets)) continue;
    for (const asset of release.assets) {
      const parsed = parseGithubAsset(asset);
      if (parsed && parsed.count > 0) {
        rows.push(parsed);
      }
    }
  }

  if (!rows.length) {
    throw new Error('No release assets matched the known platform patterns.');
  }

  return rows;
}

async function fetchTelemetryRows(statsUrl, headers) {
  let response;
  try {
    response = await fetch(statsUrl, { headers });
  } catch (err) {
    const error = new Error(err?.message || err);
    if (err && typeof err === 'object') {
      error.code = err.code || err.errno;
      error.cause = err.cause || err;
    }
    error.reason = 'request';
    throw error;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = new Error(`HTTP ${response.status} ${response.statusText}${text ? `: ${text}` : ''}`);
    error.status = response.status;
    error.responseText = text;
    error.reason = 'http';
    throw error;
  }

  try {
    const data = await response.json();
    return coalesceRows(data);
  } catch (err) {
    const error = new Error(err?.message || err);
    error.reason = 'parse';
    throw error;
  }
}

function getProxyUrl() {
  const candidates = [
    process.env.POKEMMO_TOOL_TELEMETRY_PROXY,
    process.env.HTTPS_PROXY,
    process.env.https_proxy,
    process.env.HTTP_PROXY,
    process.env.http_proxy,
  ];

  for (const value of candidates) {
    if (value && value.trim()) return value.trim();
  }

  return null;
}

function parseNoProxy(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function hostMatchesNoProxy(hostname, port, entries) {
  if (!hostname || !entries.length) return false;

  const normalizedHost = hostname.toLowerCase();

  for (const entry of entries) {
    if (entry === '*') return true;

    const [patternHost, patternPort] = entry.toLowerCase().split(':');
    if (patternPort && patternPort !== String(port || '')) continue;

    if (!patternHost) continue;

    if (patternHost.startsWith('.')) {
      const suffix = patternHost.slice(1);
      if (normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`)) return true;
      continue;
    }

    if (normalizedHost === patternHost) return true;
  }

  return false;
}

function configureProxyForUrl(targetUrl) {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) return false;

  let url;
  try {
    url = new URL(targetUrl);
  } catch {
    return false;
  }

  const noProxyEntries = parseNoProxy(process.env.NO_PROXY || process.env.no_proxy);
  if (hostMatchesNoProxy(url.hostname, url.port || (url.protocol === 'https:' ? '443' : '80'), noProxyEntries)) {
    return false;
  }

  try {
    // eslint-disable-next-line global-require
    let undici;
    try {
      undici = require('node:undici');
    } catch {
      undici = require('undici');
    }
    const { ProxyAgent, setGlobalDispatcher } = undici;
    if (typeof ProxyAgent !== 'function' || typeof setGlobalDispatcher !== 'function') return false;
    const agent = new ProxyAgent(proxyUrl);
    setGlobalDispatcher(agent);
    return true;
  } catch (err) {
    console.warn('Unable to configure proxy for telemetry stats request:', err?.message || err);
  }

  return false;
}

function collectErrorDetails(err) {
  const pieces = [];
  const seen = new Set();
  let current = err;

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);

    if (current.code && !pieces.includes(current.code)) pieces.push(current.code);
    if (current.errno && !pieces.includes(current.errno)) pieces.push(current.errno);

    if (current !== err && typeof current.message === 'string') {
      const msg = current.message.trim();
      if (msg && !pieces.includes(msg)) pieces.push(msg);
    }

    current = current.cause;
  }

  return pieces.length ? ` (${pieces.join(' | ')})` : '';
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

  configureProxyForUrl(statsUrl);

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

  let rows;
  let dataSource = 'telemetry';
  try {
    rows = await fetchTelemetryRows(statsUrl, headers);
  } catch (err) {
    const message = err?.message || err;
    const details = collectErrorDetails(err);
    if (getFallbackMode() === 'none') {
      console.error(`Telemetry stats request failed: ${message}${details}`);
      process.exitCode = 1;
      return;
    }

    console.warn(`Telemetry stats request failed: ${message}${details}`);

    try {
      const owner = getGithubOwner();
      const repo = getGithubRepo();
      configureProxyForUrl(`${GITHUB_API_BASE}/repos/${owner}/${repo}/releases`);
      rows = await loadGithubDownloadRows(owner, repo);
      dataSource = 'github';
      console.warn('Falling back to GitHub release download counts (per OS and version).');
    } catch (fallbackErr) {
      console.error(`Unable to load GitHub release download counts: ${fallbackErr?.message || fallbackErr}${collectErrorDetails(fallbackErr)}`);
      process.exitCode = 1;
      return;
    }
  }

  if (!Array.isArray(rows)) rows = coalesceRows(rows);

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
  rowsToPrint.push('');
  rowsToPrint.push(`Data source: ${dataSource === 'telemetry' ? 'Install telemetry service' : 'GitHub release download counts'}`);

  console.log(rowsToPrint.join('\n'));
}

main().catch((err) => {
  console.error('Unexpected telemetry stats failure:', err?.message || err);
  process.exitCode = 1;
});
