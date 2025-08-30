
// tools/ingest-pokemmohub.js (verbose + resilient for Gen1–5)
import fs from 'fs'
import path from 'path'
import * as cheerio from 'cheerio'

const OUT = path.join(process.cwd(), 'public', 'data', 'pokemmo_locations.json')
const CACHE_DIR = path.join(process.cwd(), '.cache', 'pokemmohub')
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.mkdirSync(CACHE_DIR, { recursive: true })

const INDEX = 'https://pokemmohub.com/tools/pokedex/'
const UA = 'weakness-finder/1.1.1 (+offline ingestor)'
const LIMIT_GEN_MAX_ID = 649
const sleepMs = 70

const BALLS = [
  { key: 'pokeball', label: 'Poké Ball', re: /Pok[eé] Ball/i },
  { key: 'great',    label: 'Great Ball', re: /Great Ball/i },
  { key: 'ultra',    label: 'Ultra Ball', re: /Ultra Ball/i },
  { key: 'quick',    label: 'Quick Ball', re: /Quick Ball/i },
  { key: 'dusk',     label: 'Dusk Ball',  re: /Dusk Ball/i },
]

function log(...a){ console.log('[ingest]', ...a) }
function warn(...a){ console.warn('[ingest]', ...a) }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)) }

async function fetchText(url) {
  const fetchImpl = globalThis.fetch ? globalThis.fetch : (await import('node-fetch')).default
  const r = await fetchImpl(url, { headers: { 'User-Agent': UA } })
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText} on ${url}`)
  return r.text()
}

function readCache(name) {
  const f = path.join(CACHE_DIR, encodeURIComponent(name)+'.html')
  return fs.existsSync(f) ? fs.readFileSync(f,'utf8') : null
}
function writeCache(name, html) {
  const f = path.join(CACHE_DIR, encodeURIComponent(name)+'.html')
  fs.writeFileSync(f, html)
}

async function getIndexEntries(verbose=true) {
  let html = readCache('__index__')
  if (!html) {
    log('fetching index…', INDEX)
    html = await fetchText(INDEX)
    writeCache('__index__', html)
  } else if (verbose) {
    log('using cached index')
  }
  const $ = cheerio.load(html)
  const out = []
  $('a[href^="/tools/pokedex/"]').each((_,a)=>{
    const href = $(a).attr('href') || ''
    const m = href.match(/^\/tools\/pokedex\/([^?#/]+)\/?/)
    if (!m) return
    const slug = m[1]
    const text = ($(a).text() || '').trim()
    out.push({ slug, href: new URL(href, INDEX).toString(), text })
  })
  const seen = new Set(); const uniq=[]
  for (const e of out){ if (seen.has(e.slug)) continue; seen.add(e.slug); uniq.push(e) }
  if (verbose) log(`index entries: ${uniq.length}`)
  return uniq
}

function parseDexId($) {
  const raw = $('body').text()
  const m = raw.match(/#\s*(\d{1,4})/)
  return m ? parseInt(m[1],10) : null
}

function parseLocations($) {
  let sec = null
  $('section').each((_,s)=>{ const h2=$(s).find('h2').first().text().trim().toLowerCase(); if (h2.includes('location')) sec=$(s) })
  if (!sec) return []
  const out=[]
  sec.find('tr').each((_,tr)=>{
    const tds = $(tr).find('td'); if (tds.length<3) return
    const T = i => $(tds[i]).text().replace(/\s+/g,' ').trim()
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

function parseCatchRates($) {
  const text = $('body').text().replace(/\s+/g,' ')
  const out = {}
  for (const b of BALLS) {
    const m = text.match(b.re); if (!m) continue
    const slice = text.slice(m.index, m.index+1500)
    const pick = (label) => slice.match(new RegExp(label+ '\\\\s*:??\\\\s*(\\\\d+\\\\s*%)','i'))?.[1] || null
    const fullHp = pick('Full\\\\s*HP') || pick('FullHP')
    const oneHp  = pick('1\\\\s*HP')    || pick('1HP')
    const asleep = pick('Asleep')
    if (fullHp || oneHp || asleep) out[b.key] = { fullHp, oneHp, asleep }
  }
  return out
}

async function main(){
  log('starting…')
  const entries = await getIndexEntries(true)
  if (!entries.length) { warn('index returned 0 entries — check network or site layout'); }
  const argI = process.argv.indexOf('--species')
  let filter = null
  if (argI>=0) filter = (process.argv[argI+1] || '').toLowerCase()

  let list = entries
  if (filter) {
    const best = entries.find(e => (e.text||'').toLowerCase().includes(filter) || (e.slug||'').toLowerCase().includes(filter))
    if (!best) { warn(`no species matching "${filter}"`); list = [] }
    else list = [best]
    log('resolved species:', list[0]?.slug, '→', list[0]?.href, 'text=', list[0]?.text)
  }

  const db = {}
  let i=0
  for (const e of list) {
    i++
    try {
      let html = readCache(e.slug)
      if (!html) {
        log(`fetch ${i}/${list.length}:`, e.href)
        html = await fetchText(e.href)
        writeCache(e.slug, html)
        await sleep(sleepMs)
      } else {
        log(`cached ${i}/${list.length}:`, e.slug)
      }
      const $ = cheerio.load(html)
      const id = parseDexId($)
      if (!id || id > LIMIT_GEN_MAX_ID) { log(`skip ${e.slug} (id=${id})`); continue }
      const locations = parseLocations($)
      const catchRates = parseCatchRates($)
      const key = (e.text||'').trim().toLowerCase()
      db[key] = { locations, catchRates }
      db[String(id)] = db[key]
      log(`+ #${id} ${(e.text||'').trim()}  loc:${locations.length}  balls:${Object.keys(catchRates).length}`)
    } catch(err) {
      warn(`error on ${e.slug}:`, err.message)
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(db, null, 2))
  log(`Wrote ${OUT}  entries: ${Object.keys(db).length}`)
}

main().catch(e=>{ console.error(e); process.exit(1) })
