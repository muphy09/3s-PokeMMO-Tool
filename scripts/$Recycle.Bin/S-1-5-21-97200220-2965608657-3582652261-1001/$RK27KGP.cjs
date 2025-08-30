const fs = require("fs");
const path = require("path");

const IN = path.join(__dirname, "..", "public", "data", "pokemmo_locations.json");
const raw = JSON.parse(fs.readFileSync(IN, "utf8"));
const src = (raw && typeof raw.data === "object") ? raw.data : raw;

const out = {};

const normalizeKey = (s) =>
  (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘“”'`]/g, "")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();

const canonicalKey = (s) => normalizeKey(s).replace(/[:]/g, "-").replace(/\s/g, "-");

// remove "Credit to ..." notes, @handles, and any odd symbols
const cleanText = (s) =>
  (s || "")
    .replace(/\s*-\s*credit\s+to.*$/i, "")
    .replace(/\s*credit\s+to.*$/i, "")
    .replace(/@\w+/g, "")
    .replace(/[^\x20-\x7E]/g, "") // keep printable ASCII
    .replace(/\s+/g, " ")
    .trim();

// merge preferring non-empty locations
for (const [rawKey, v] of Object.entries(src)) {
  // strip accidental leading conjunctions/articles in keys
  const key = canonicalKey(rawKey.replace(/^(and|or|the)\s+/i, "").replace(/^(and|or|the)-/i, ""));

  const rec = Array.isArray(v) ? { locations: v } : (v || {});
  const locs = Array.isArray(rec.locations) ? rec.locations : [];

  const cleaned = locs.map(r => ({
    region: cleanText(r.region),
    map: cleanText(r.map || r.route),
    subarea: cleanText(r.subarea),
    method: cleanText(r.method),
    rarity: cleanText(r.rarity || r.rate),
    type: cleanText(r.type),
    level: cleanText(r.level || r.levels),
    time: cleanText(r.time),
  })).filter(r => (r.map || r.subarea));

  if (!out[key]) out[key] = { locations: [], catchRates: {} };

  if (cleaned.length) out[key].locations = cleaned;
  if (rec.catchRates && Object.keys(rec.catchRates).length) {
    out[key].catchRates = rec.catchRates;
  }
}

fs.writeFileSync(IN, JSON.stringify(out, null, 2));
console.log("Cleaned", Object.keys(out).length, "entries ->", IN);
