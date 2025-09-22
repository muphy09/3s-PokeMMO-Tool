import itemsRaw from '../../itemdata.json';

const CACHE_VERSION = '2';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

const SHOWDOWN_MOVES_URL = 'https://play.pokemonshowdown.com/data/moves.json';
const SHOWDOWN_ABILITIES_URL = 'https://play.pokemonshowdown.com/data/abilities.js';

const TIER_METADATA = [
  { id: 'ou', label: 'OU', setsUrl: 'https://data.pkmn.cc/sets/gen5ou.json', analysesUrl: 'https://data.pkmn.cc/analyses/gen5ou.json' },
  { id: 'uu', label: 'UU', setsUrl: 'https://data.pkmn.cc/sets/gen5uu.json', analysesUrl: 'https://data.pkmn.cc/analyses/gen5uu.json' },
  { id: 'ru', label: 'RU', setsUrl: 'https://data.pkmn.cc/sets/gen5ru.json', analysesUrl: 'https://data.pkmn.cc/analyses/gen5ru.json' },
  { id: 'nu', label: 'NU', setsUrl: 'https://data.pkmn.cc/sets/gen5nu.json', analysesUrl: 'https://data.pkmn.cc/analyses/gen5nu.json' },
  { id: 'pu', label: 'PU', setsUrl: 'https://data.pkmn.cc/sets/gen5pu.json', analysesUrl: 'https://data.pkmn.cc/analyses/gen5pu.json' },
  { id: 'zu', label: 'ZU', setsUrl: 'https://data.pkmn.cc/sets/gen5zu.json', analysesUrl: 'https://data.pkmn.cc/analyses/gen5zu.json' },
  { id: 'ubers', label: 'Ubers', setsUrl: 'https://data.pkmn.cc/sets/gen5ubers.json', analysesUrl: 'https://data.pkmn.cc/analyses/gen5ubers.json' },
  { id: 'lc', label: 'LC', setsUrl: 'https://data.pkmn.cc/sets/gen5lc.json', analysesUrl: 'https://data.pkmn.cc/analyses/gen5lc.json' },
  { id: 'doublesou', label: 'Doubles OU', setsUrl: 'https://data.pkmn.cc/sets/gen5doublesou.json', analysesUrl: 'https://data.pkmn.cc/analyses/gen5doublesou.json' },
  { id: 'monotype', label: 'Monotype', setsUrl: 'https://data.pkmn.cc/sets/gen5monotype.json', analysesUrl: 'https://data.pkmn.cc/analyses/gen5monotype.json' },
  { id: '1v1', label: '1v1', setsUrl: 'https://data.pkmn.cc/sets/gen51v1.json', analysesUrl: 'https://data.pkmn.cc/analyses/gen51v1.json' },
  { id: 'cap', label: 'CAP', setsUrl: 'https://data.pkmn.cc/sets/gen5cap.json', analysesUrl: 'https://data.pkmn.cc/analyses/gen5cap.json' },
  { id: 'vgc2011', label: 'VGC 2011', setsUrl: 'https://data.pkmn.cc/sets/gen5vgc2011.json', analysesUrl: 'https://data.pkmn.cc/analyses/gen5vgc2011.json' },
  { id: 'vgc2012', label: 'VGC 2012', setsUrl: 'https://data.pkmn.cc/sets/gen5vgc2012.json', analysesUrl: 'https://data.pkmn.cc/analyses/gen5vgc2012.json' }
];

const STAT_LABELS = {
  hp: 'HP',
  atk: 'Atk',
  def: 'Def',
  spa: 'SpA',
  spd: 'SpD',
  spe: 'Spe'
};

const STAT_READABLE = {
  attack: 'Attack',
  defense: 'Defense',
  special_attack: 'Sp. Atk',
  special_defense: 'Sp. Def',
  speed: 'Speed'
};

const tierById = new Map(TIER_METADATA.map(meta => [meta.id, meta]));
const tierSetsCache = new Map();
const tierAnalysesCache = new Map();
const nameIndexCache = new Map();

const ITEM_INDEX = buildItemIndex(itemsRaw || []);

let movesDexPromise = null;
let abilitiesDexPromise = null;

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/â™€/g, 'f')
    .replace(/â™‚/g, 'm')
    .replace(/[^a-z0-9]+/g, '');
}

function sanitizeText(text = '') {
  return String(text).replace(/\s+/g, ' ').trim();
}

function buildItemIndex(rawItems) {
  const map = new Map();
  for (const item of rawItems) {
    if (!item?.name) continue;
    map.set(normalizeName(item.name), {
      id: item.id,
      name: item.name,
      description: sanitizeText(item.description || '')
    });
  }
  return map;
}

const STATIC_NATURES = [
  { name: 'Hardy' },
  { name: 'Lonely', inc: 'attack', dec: 'defense' },
  { name: 'Brave', inc: 'attack', dec: 'speed' },
  { name: 'Adamant', inc: 'attack', dec: 'special_attack' },
  { name: 'Naughty', inc: 'attack', dec: 'special_defense' },
  { name: 'Bold', inc: 'defense', dec: 'attack' },
  { name: 'Docile' },
  { name: 'Relaxed', inc: 'defense', dec: 'speed' },
  { name: 'Impish', inc: 'defense', dec: 'special_attack' },
  { name: 'Lax', inc: 'defense', dec: 'special_defense' },
  { name: 'Timid', inc: 'speed', dec: 'attack' },
  { name: 'Hasty', inc: 'speed', dec: 'defense' },
  { name: 'Serious' },
  { name: 'Jolly', inc: 'speed', dec: 'special_attack' },
  { name: 'Naive', inc: 'speed', dec: 'special_defense' },
  { name: 'Modest', inc: 'special_attack', dec: 'attack' },
  { name: 'Mild', inc: 'special_attack', dec: 'defense' },
  { name: 'Quiet', inc: 'special_attack', dec: 'speed' },
  { name: 'Bashful' },
  { name: 'Rash', inc: 'special_attack', dec: 'special_defense' },
  { name: 'Calm', inc: 'special_defense', dec: 'attack' },
  { name: 'Gentle', inc: 'special_defense', dec: 'defense' },
  { name: 'Sassy', inc: 'special_defense', dec: 'speed' },
  { name: 'Careful', inc: 'special_defense', dec: 'special_attack' },
  { name: 'Quirky' }
];

function describeNature(entry) {
  if (!entry) return null;
  const inc = entry.inc ? STAT_READABLE[entry.inc] : null;
  const dec = entry.dec ? STAT_READABLE[entry.dec] : null;
  if (!inc && !dec) return 'Neutral nature';
  if (inc && dec && inc !== dec) {
    return `Raises ${inc}, lowers ${dec}.`;
  }
  if (inc && !dec) return `Raises ${inc}.`;
  if (!inc && dec) return `Lowers ${dec}.`;
  return null;
}

function buildNatureIndex() {
  const map = new Map();
  for (const nature of STATIC_NATURES) {
    const key = normalizeName(nature.name);
    map.set(key, {
      name: nature.name,
      inc: nature.inc || null,
      dec: nature.dec || null,
      description: describeNature(nature)
    });
  }
  return map;
}

const NATURE_INDEX = buildNatureIndex();

function getStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage || null;
  } catch (err) {
    console.warn('[SmogonService] localStorage unavailable', err);
    return null;
  }
}

function getStorageKey(type, tierId) {
  return `smogonGen5:${CACHE_VERSION}:${type}:${tierId}`;
}

function loadCachedPayload(type, tierId) {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(getStorageKey(type, tierId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.timestamp && parsed.timestamp + CACHE_TTL_MS < Date.now()) {
      storage.removeItem(getStorageKey(type, tierId));
      return null;
    }
    return parsed.data || null;
  } catch (err) {
    console.warn('[SmogonService] failed to read cache', err);
    return null;
  }
}

function storePayload(type, tierId, data) {
  const storage = getStorage();
  if (!storage) return;
  try {
    const payload = JSON.stringify({ timestamp: Date.now(), data });
    storage.setItem(getStorageKey(type, tierId), payload);
  } catch (err) {
    if (process?.env?.NODE_ENV !== 'production') {
      console.warn('[SmogonService] failed to store cache', err);
    }
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Smogon fetch failed (${response.status})`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Smogon fetch failed (${response.status})`);
  }
  return response.text();
}

async function ensureTierSets(tierId) {
  if (tierSetsCache.has(tierId)) {
    return tierSetsCache.get(tierId);
  }
  const meta = tierById.get(tierId);
  if (!meta) throw new Error(`Unknown Smogon tier: ${tierId}`);
  let payload = loadCachedPayload('sets', tierId);
  if (!payload) {
    payload = await fetchJson(meta.setsUrl);
    storePayload('sets', tierId, payload);
  }
  const nameIndex = buildNameIndex(payload);
  nameIndexCache.set(tierId, nameIndex);
  tierSetsCache.set(tierId, payload);
  return payload;
}

async function ensureTierAnalyses(tierId) {
  if (tierAnalysesCache.has(tierId)) {
    return tierAnalysesCache.get(tierId);
  }
  const meta = tierById.get(tierId);
  if (!meta) throw new Error(`Unknown Smogon tier: ${tierId}`);
  let payload = loadCachedPayload('analyses', tierId);
  if (!payload) {
    payload = await fetchJson(meta.analysesUrl);
    storePayload('analyses', tierId, payload);
  }
  tierAnalysesCache.set(tierId, payload);
  return payload;
}

function buildNameIndex(payload) {
  const index = new Map();
  Object.keys(payload || {}).forEach(species => {
    index.set(normalizeName(species), species);
  });
  return index;
}

async function ensureMovesDex() {
  if (!movesDexPromise) {
    movesDexPromise = fetchJson(SHOWDOWN_MOVES_URL)
      .then(data => {
        const map = new Map();
        for (const move of Object.values(data || {})) {
          if (!move || !move.name) continue;
          map.set(normalizeName(move.name), move);
          if (move.id) {
            map.set(normalizeName(move.id), move);
          }
        }
        return map;
      })
      .catch(err => {
        movesDexPromise = null;
        throw err;
      });
  }
  return movesDexPromise;
}

async function ensureAbilitiesDex() {
  if (!abilitiesDexPromise) {
    abilitiesDexPromise = fetchText(SHOWDOWN_ABILITIES_URL)
      .then(text => {
        const exportsObj = {};
        const moduleObj = { exports: {} };
        const factory = new Function('exports', 'module', `${text}; return module.exports || exports.BattleAbilities || exports.Abilities || exports;`);
        const raw = factory(exportsObj, moduleObj) || {};
        const abilities = raw.BattleAbilities || raw.Abilities || raw;
        const map = new Map();
        for (const value of Object.values(abilities || {})) {
          if (!value?.name) continue;
          map.set(normalizeName(value.name), value);
        }
        return map;
      })
      .catch(err => {
        abilitiesDexPromise = null;
        throw err;
      });
  }
  return abilitiesDexPromise;
}

function expandValues(input) {
  if (Array.isArray(input)) {
    return input.flatMap(expandValues);
  }
  if (input == null || input === '') return [];
  if (typeof input === 'object') {
    const { name, label } = input || {};
    if (name || label) return expandValues(name || label);
    return [];
  }
  return [String(input)];
}

function buildChoiceList(values, lookup, kind) {
  const results = [];
  const seen = new Set();
  for (const raw of expandValues(values)) {
    const label = raw.trim();
    if (!label) continue;
    const key = normalizeName(label);
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = lookup?.get?.(key) || null;
    let tooltip = null;
    if (kind === 'item' && entry) {
      tooltip = { kind: 'item', name: entry.name, description: entry.description || null };
    } else if (kind === 'ability' && entry) {
      tooltip = { kind: 'ability', name: entry.name, description: entry.shortDesc || entry.desc || null };
    } else if (kind === 'nature' && entry) {
      tooltip = { kind: 'nature', name: entry.name, description: entry.description || null };
    }
    const extra = {};
    if (kind === 'item') {
      extra.itemId = entry?.id ?? null;
    }
    results.push({ label, tooltip, ...extra });
  }
  return results;
}

async function buildSetEntries(speciesSets = {}, analysisSets = {}) {
  const [movesDex, abilitiesDex] = await Promise.all([
    ensureMovesDex(),
    ensureAbilitiesDex()
  ]);

  return Object.entries(speciesSets).map(([setName, details]) => {
    const analysisEntry = analysisSets?.[setName] || null;
    const moveSlots = (details.moves || []).map(slot => {
      const options = expandValues(slot)
        .map(label => {
          const key = normalizeName(label);
          const move = movesDex.get(key) || null;
          if (!label.trim()) return null;
          const tooltip = move
            ? {
                kind: 'move',
                name: move.name || label,
                description: move.shortDesc || move.desc || null,
                type: move.type || null,
                category: move.category || null,
                power: move.basePower ?? null,
                accuracy: move.accuracy ?? null
              }
            : null;
          return { label, tooltip };
        })
        .filter(Boolean);
      return options;
    }).filter(slot => slot.length);

    const abilityOptions = buildChoiceList(details.ability, abilitiesDex, 'ability');
    const itemOptions = buildChoiceList(details.item, ITEM_INDEX, 'item');
    const natureOptions = buildChoiceList(details.nature, NATURE_INDEX, 'nature');

    const evsText = formatSpread(details.evs);
    const ivsText = formatSpread(details.ivs);
    const level = details.level != null ? details.level : null;

    return {
      name: setName,
      moves: moveSlots,
      items: itemOptions,
      ability: abilityOptions,
      nature: natureOptions,
      evsText,
      ivsText,
      level,
      descriptionHtml: analysisEntry?.description || null,
      outdated: Boolean(analysisEntry?.outdated)
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function formatSpread(spread) {
  if (!spread) return null;
  if (Array.isArray(spread)) {
    const variants = spread.map(formatSpread).filter(Boolean);
    return variants.length ? variants.join(' or ') : null;
  }
  if (typeof spread !== 'object') return String(spread);
  const parts = [];
  for (const [stat, value] of Object.entries(spread)) {
    if (value == null || value === '') continue;
    const label = STAT_LABELS[stat.toLowerCase()] || stat.toUpperCase();
    parts.push(`${label} ${value}`);
  }
  return parts.join(' / ');
}

function extractSectionHtml(commentsHtml, title) {
  if (!commentsHtml || typeof DOMParser === 'undefined') return null;
  try {
    const doc = new DOMParser().parseFromString(commentsHtml, 'text/html');
    const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4'));
    const target = headings.find(el => el.textContent?.trim().toLowerCase().startsWith(title.toLowerCase()));
    if (!target) return null;
    const fragments = [];
    let node = target.nextSibling;
    while (node) {
      if (node.nodeType === 1) {
        const tag = node.tagName.toLowerCase();
        if (/^h[1-4]$/.test(tag)) break;
        fragments.push(node.outerHTML);
      } else if (node.nodeType === 3) {
        const text = node.textContent.trim();
        if (text) fragments.push(text);
      }
      node = node.nextSibling;
    }
    const html = fragments.join('').trim();
    return html || null;
  } catch (err) {
    console.warn(`[SmogonService] failed to parse ${title} section`, err);
    return null;
  }
}

function resolveSpeciesKey(tierId, speciesName) {
  const normalized = normalizeName(speciesName);
  let nameIndex = nameIndexCache.get(tierId);
  if (!nameIndex) {
    const tierData = tierSetsCache.get(tierId);
    if (tierData) {
      nameIndex = buildNameIndex(tierData);
      nameIndexCache.set(tierId, nameIndex);
    }
  }
  if (nameIndex?.has(normalized)) {
    return nameIndex.get(normalized);
  }
  return null;
}

export async function getRecommendedMovesets(speciesName) {
  if (!speciesName) {
    return { tiers: [], defaultTierId: null };
  }

  const tierResults = [];

  for (const meta of TIER_METADATA) {
    try {
      const setsData = await ensureTierSets(meta.id);
      const resolvedName = resolveSpeciesKey(meta.id, speciesName);
      if (!resolvedName) continue;
      const speciesSets = setsData?.[resolvedName];
      if (!speciesSets) continue;
      const analysesData = await ensureTierAnalyses(meta.id);
      const analysisEntry = analysesData?.[resolvedName] || null;
      const sets = await buildSetEntries(speciesSets, analysisEntry?.sets || {});
      tierResults.push({
        id: meta.id,
        label: meta.label,
        overviewHtml: analysisEntry?.overview || null,
        sets,
        otherOptionsHtml: extractSectionHtml(analysisEntry?.comments || null, 'other options'),
        checksHtml: extractSectionHtml(analysisEntry?.comments || null, 'checks and counters'),
        outdated: Boolean(analysisEntry?.outdated)
      });
    } catch (err) {
      console.warn(`[SmogonService] skipped tier ${meta.id}`, err);
    }
  }

  const preferred = tierResults.find(entry => entry.id === 'ou');
  const defaultTierId = preferred ? preferred.id : (tierResults[0]?.id ?? null);

  return {
    tiers: tierResults,
    defaultTierId
  };
}

export const AVAILABLE_GENS = {
  gen: 'gen5',
  tiers: TIER_METADATA.map(({ id, label }) => ({ id, label }))
};



