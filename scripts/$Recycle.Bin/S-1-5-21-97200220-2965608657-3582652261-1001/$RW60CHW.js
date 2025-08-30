// tools/ingest-from-har.js  (Gatsby SQ-aware)
import fs from 'fs'
import path from 'path'
import * as cheerio from 'cheerio'

const inFile = process.argv[2]
if (!inFile) {
  console.error('Usage: node tools/ingest-from-har.js <pokemmohub.har>')
  process.exit(1)
}

const OUT   = path.join(process.cwd(), 'public', 'data', 'pokemmo_locations.json')
const DEBUG = path.join(process.cwd(), '.cache', 'har_debug')
await fs.promises.mkdir(path.dirname(OUT), { recursive: true })
await fs.promises.mkdir(DEBUG, { recursive: true })

const LIMIT_GEN_MAX_ID = 649

const isJsonLike = (mime, txt) =>
  (mime && mime.toLowerCase().includes('json')) ||
  (txt && txt.trim().startsWith('{')) || (txt && txt.trim().startsWith('['))

const isHtmlLike = (mime, txt) =>
  (mime && mime.toLowerCase().includes('html')) ||
  /^\s*<!doctype html|^\s*<html/i.test(txt||'')

const dexFromText = t => {
  const m = String(t||'').match(/#\s*(\d{1,4})/); return m ? parseInt(m[1],10) : null
}

function safeParse(t){ try { return JSON.parse(t) } catch { return null } }

function merge(db, name, id, rec){
  if (!name) return
  if (id && id > LIMIT_GEN_MAX_ID) return
  name = name.toLowerCase()
  const cur = db[name] || { locations: [], catchRates: {} }
  const seen = new Set(cur.locations.map(l => JSON.stringify(l)))
  for (const l of (rec.locations||[])) {
    const s = JSON.stringify(l)
    if (!seen.has(s)) { cur.locations.push(l); seen.add(s) }
  }
  cur.catchRates = { ...cur.catchRates, ...(rec.catchRates||{}) }
  db[name] = cur
  if (id) db[String(id)] = db[name]
}

/* ------------ HTML fallbacks (rare) ------------- */
function parseLocationsHTML($){
  let sec = null
  $('section,div,article').each((_,el)=>{
    const h = ($(el).find('h2').first().text() || '').toLowerCase()
    if (h.includes('location')) sec = $(el)
  })
  if (!sec) $('table').each((_,t)=>{
    const txt = $(t).text().toLowerCase()
    if (txt.includes('region') && txt.includes('route')) sec = $(t)
  })
  if (!sec) return []
  const out=[]
  const rows = sec.find('tr')
  rows.each((_,tr)=>{
    const tds = cheerio.default(tr).find('td'); if (tds.length<2) return
    const T = i => cheerio.default(tds[i]).text().replace(/\s+/g,' ').trim()
    const region=T(0)||'', map=T(1)||'', method=T(2)||''
    let levels='', time='', rate=''
    for (let i=3;i<tds.length;i++){
      const v=T(i); if(!v) continue
      if (/\bDay\b|\bNight\b|\bAny\b/i.test(v)) time ||= v
      else if (/%|Common|Uncommon|Rare|Very Rare/i.test(v)) rate ||= v
      else if (/\d/.test(v)) levels ||= v
    }
    if (region||map||method) out.push({ region, map, subarea:'', method, levels, time, rate })
  })
  return out
}
const BALLS = [
  { key: 'pokeball', re: /Pok[eé] ?Ball/i },
  { key: 'great',    re: /Great ?Ball/i },
  { key: 'ultra',    re: /Ultra ?Ball/i },
  { key: 'quick',    re: /Quick ?Ball/i },
  { key: 'dusk',     re: /Dusk ?Ball/i },
]
function parseCatchHTML($){
  const text = $('body').text().replace(/\s+/g,' ')
  const out = {}
  for (const b of BALLS) {
    const m = text.match(b.re); if (!m) continue
    const slice = text.slice(m.index, m.index+1500)
    const pick = lab => slice.match(new RegExp(lab+'\\s*:??\\s*(\\d+\\s*%)','i'))?.[1] || null
    const fullHp = pick('Full\\s*HP') || pick('FullHP')
    const oneHp  = pick('1\\s*HP')    || pick('1HP')
    const asleep = pick('Asleep')
    if (fullHp || oneHp || asleep) out[b.key] = { fullHp, oneHp, asleep }
  }
  return out
}

/* ------------ Gatsby static-query JSON ------------- */
function collectAllObjects(node, bag){
  if (!node) return
  if (Array.isArray(node)) { node.forEach(n=>collectAllObjects(n, bag)); return }
  if (typeof node === 'object') {
    bag.push(node)
    for (const v of Object.values(node)) collectAllObjects(v, bag)
  }
}

function tryNormalize(obj){
  // Names are often under pokemmo / n.en etc.
  const name =
    (obj?.pokemmo?.n?.en) ||
    obj?.n?.en ||
    obj?.name ||
    obj?.species ||
    obj?.pokemon ||
    obj?.slug ||
    null

  // Dex id often present as national, dex, id, or embedded as "#123"
  const id =
    obj?.pokemmo?.national ??
    obj?.national ??
    obj?.dex ??
    obj?.id ??
    null

  // Locations array candidates
  const locArr =
    obj?.pokemmo?.locations ||
    obj?.locations ||
    obj?.encounters ||
    obj?.spawns ||
    null

  // Catch rate object candidates
  const catchObj =
    obj?.pokemmo?.catchRates ||
    obj?.catchRates ||
    obj?.capture ||
    obj?.balls ||
    null

  const rec = { locations: [], catchRates: {} }

  if (Array.isArray(locArr)) {
    for (const l of locArr) {
      if (typeof l !== 'object') continue
      const region = l.region || l.game || ''
      const map    = l.map || l.location || l.area || l.route || ''
      const method = l.method || l.encounter || l.how || ''
      const rate   = l.rate || l.rarity || l.chance || ''
      const levels = l.levels || l.level || ''
      const time   = l.time || l.timeOfDay || ''
      if (region || map || method) rec.locations.push({ region, map, subarea:'', method, levels, time, rate })
    }
  }

  if (catchObj && typeof catchObj === 'object') {
    const take = (o,klist) => klist.find(k => o && o[k] != null)
    const normBall = k =>
      /pok[eé]? ?ball/i.test(k) ? 'pokeball' :
      /great/i.test(k) ? 'great' :
      /ultra/i.test(k) ? 'ultra' :
      /quick/i.test(k) ? 'quick' :
      /dusk/i.test(k)  ? 'dusk'  : null

    for (const [k,v] of Object.entries(catchObj)) {
      const nb = normBall(k); if (!nb) continue
      const fullHp = take(v, ['fullHp','full','full-hp','full_hp'])
      const oneHp  = take(v, ['oneHp','low','1hp','1_hp'])
      const asleep = take(v, ['asleep','sleep','slp'])
      if (fullHp || oneHp || asleep) {
        rec.catchRates[nb] = {
          fullHp: fullHp ? String(fullHp) : null,
          oneHp:  oneHp  ? String(oneHp)  : null,
          asleep: asleep ? String(asleep) : null,
        }
      }
    }
  }

  if (!name && !rec.locations.length && !Object.keys(rec.catchRates).length) return null
  return { name, id, ...rec }
}

async function main(){
  const raw = await fs.promises.readFile(inFile, 'utf8')
  const har = safeParse(raw)
  if (!har) throw new Error('Invalid HAR JSON')

  const entries = har.log?.entries || []
  console.log(`[har] entries: ${entries.length}`)

  const db = {}
  let jsonSeen=0, htmlSeen=0, merged=0

  for (const e of entries) {
    const url  = e.request?.url || ''
    const mime = e.response?.content?.mimeType || ''
    const text = e.response?.content?.text || ''
    if (!text) continue

    // ---- JSON (esp. /page-data/sq/d/*.json) ----
    if (isJsonLike(mime, text)) {
      jsonSeen++
      const data = safeParse(text)
      const dbg = path.join(DEBUG, `json_${String(jsonSeen).padStart(3,'0')}.txt`)
      await fs.promises.writeFile(dbg, `URL: ${url}\n${text.slice(0,3000)}`)

      // Walk everything and try to normalize any object that looks like species data
      const objs = []
      collectAllObjects(data, objs)
      for (const o of objs) {
        // prefer nodes that carry a 'pokemmo' or 'locations' or 'catchRates'
        if (!('pokemmo' in o) && !('locations' in o) && !('encounters' in o) && !('catchRates' in o)) continue
        const rec = tryNormalize(o)
        if (!rec?.name) continue
        merge(db, rec.name, rec.id, rec)
        merged++
      }
      continue
    }

    // ---- HTML fallback (if any HTML is in HAR) ----
    if (isHtmlLike(mime, text)) {
      const $ = cheerio.load(text)
      const body = $('body').text()
      const looksLike = /Locations/i.test(body) && /(Region|Route|Rarity|Type|Level)/i.test(body)
      if (looksLike) {
        htmlSeen++
        const name = ($('h1').first().text() || $('title').text() || '').trim().toLowerCase()
        const id = dexFromText(body)
        const locations = parseLocationsHTML($)
        const catchRates = parseCatchHTML($)
        if (name && (locations.length || Object.keys(catchRates).length)) {
          merge(db, name, id, { locations, catchRates })
          merged++
        }
      }
    }
  }

  await fs.promises.writeFile(OUT, JSON.stringify(db, null, 2))
  console.log(`[har] parsed JSON responses: ${jsonSeen}`)
  console.log(`[har] parsed HTML detail pages: ${htmlSeen}`)
  console.log(`[har] species merged: ${merged}`)
  console.log(`[har] wrote -> ${OUT} keys: ${Object.keys(db).length}`)
  console.log(`[har] debug: ${DEBUG}`)
}

main().catch(err => { console.error(err); process.exit(1) })
