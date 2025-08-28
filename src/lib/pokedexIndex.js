// Centralized Pokédex loader + search utilities for gens 1–5.
// Compatible with legacy shapes: supports `dex` OR `id`, plus optional sprite-ish fields.

import rawDex from "../../UpdatedDex.json"; // uses root UpdatedDex data

function norm(s) {
  return (s ?? "")
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const POKEDEX = Array.isArray(rawDex) ? rawDex : [];
const byDex = new Map();
const bySlug = new Map();
const byName = new Map();

for (const mon of POKEDEX) {
  const dexNum =
    typeof mon.dex === "number"
      ? mon.dex
      : typeof mon.id === "number"
      ? mon.id
      : null;

  const shaped = {
    dex: dexNum, // canonical id
    name: mon.name ?? "",
    slug: mon.slug ?? "",
    types: Array.isArray(mon.types) ? mon.types : [],
    // --- sprite-ish pass-throughs (some datasets differ) ---
    sprite: mon.sprite ?? null,
    sprites: mon.sprites ?? null,       // e.g., PokeAPI { front_default: ... }
    image: mon.image ?? null,
    icon: mon.icon ?? null,
    // Optional scraper fields (future)
    locations: mon.locations ?? null,
    catchRate: mon.catchRate ?? null,
  };

  if (shaped.dex !== null) byDex.set(shaped.dex, shaped);
  if (shaped.slug) bySlug.set(norm(shaped.slug), shaped);
  if (shaped.name) byName.set(norm(shaped.name), shaped);
}

export function getAll() {
  return [...byDex.values()].sort((a, b) => a.dex - b.dex);
}
export function getByDex(num) {
  return byDex.get(Number(num)) ?? null;
}
export function getBySlug(slug) {
  return bySlug.get(norm(slug)) ?? null;
}
export function getByName(name) {
  return byName.get(norm(name)) ?? null;
}

/**
 * Search logic:
 * - numbers: prefix on dex (e.g., "25" matches #25 & #250…)
 * - text: substring on name or slug, plus name prefix
 * - optional type filter: exact (case-insensitive)
 */
export function search(query, opts = {}) {
  const q = norm(query);
  const typeFilter = opts.type ? norm(opts.type) : null;

  let haystack = getAll();

  if (q) {
    const qNum = Number(q);
    const qIsNumber = !Number.isNaN(qNum) && /^\d+$/.test(q);

    if (qIsNumber) {
      haystack = haystack.filter((m) =>
        String(m.dex).startsWith(String(qNum))
      );
    } else {
      haystack = haystack.filter((m) => {
        const n = norm(m.name);
        const s = norm(m.slug);
        return n.startsWith(q) || n.includes(q) || s.includes(q);
      });
    }
  }

  if (typeFilter) {
    haystack = haystack.filter((m) =>
      (m.types || []).some((t) => norm(t) === typeFilter)
    );
  }

  return haystack;
}

export function isPokedexLoaded() {
  return POKEDEX.length > 0 && byDex.size > 0;
}
