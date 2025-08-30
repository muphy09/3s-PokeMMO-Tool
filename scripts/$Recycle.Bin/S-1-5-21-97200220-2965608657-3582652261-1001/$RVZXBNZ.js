// Visible (non-headless) resilient ingestor (Gen 1–5)
import puppeteer from 'puppeteer'
import * as cheerio from 'cheerio'
import fs from 'fs'
import path from 'path'

const OUT = path.join(process.cwd(), 'public', 'data', 'pokemmo_locations.json')
await fs.promises.mkdir(path.dirname(OUT), { recursive: true })

const INDEX_URL = 'https://pokemmohub.com/tools/pokedex/'
const LIMIT_GEN_MAX_ID = 649
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const BALLS = [
  { key: 'pokeball', re: /Pok[eé] Ball/i },
  { key: 'great',    re: /Great Ball/i },
  { key: 'ultra',    re: /Ultra Ball/i },
  { key: 'quick',    re: /Quick Ball/i },
  { key: 'dusk',     re: /Dusk Ball/i },
]

async function clickButtonsByText(page, texts) {
  return await page.evaluate((needles) => {
    const lower = (s) => (s || '').trim().toLowerCase()
    const nodes = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], a'))
    let clicked = false
    for (const n of nodes) {
      const label = lower(n.textContent) || lower(n.getAttribute('aria-label'))
      if (!label) continue
      if (needles.some(t => label.includes(t))) { n.click(); clicked = true }
    }
    return clicked
  }, texts.map(t => t.toLowerCase()))
}

async function deepScroll(page, opts) {
  let lastHeight = 0, sameCount = 0
  const maxLoops = opts?.maxLoops ?? 120
  const settleCycles = opts?.settleCycles ?? 4
  for (let i = 0; i < maxLoops; i++) {
    await clickButtonsByText(page, ['load more', 'show more', 'view more', 'view all', 'see more', 'more'])
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.9))
    await sleep(450)
    const h = await page.evaluate(() => document.scrollingElement ? document.scrollingElement.scrollHeight : document.body.scrollHeight)
    if (h === lastHeight) { sameCount++; if (sameCount >= settleCycles) break }
    else { sameCount = 0; lastHeight = h }
    if (i % 8 === 7) { await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await sleep(600) }
  }
}

function parseDexId($) {
  const raw = $('body').text()
  const m = raw.match(/#\s*(\d{1,4})/)
  return m ? parseInt(m[1], 10) : null
}
function parseLocations($) {
  let sec = null
  $('section').each((_, s) => {
    const h2 = $(s).find('h2').first().text().trim().toLowerCase()
    if (h2.includes('location')) sec = $(s)
  })
  if (!sec) return []
  const out = []
  sec.find('tr').each((_, tr) => {
    const tds = $(tr).find('td'); if (tds.length < 3) return
    const T = i => $(tds[i]).text().replace(/\s+/g, ' ').trim()
    const region = T(0) || '', map = T(1) || '', method = T(2) || ''
    let levels = '', time = '', rate = ''
    for (let i = 3; i < tds.length; i++) {
      const v = T(i); if (!v) continue
      if (/\bDay\b|\bNight\b|\bAny\b/i.test(v)) time ||= v
      else if (/%|Common|Uncommon|Rare|Very Rare/i.test(v)) rate ||= v
      else if (/\d/.test(v)) levels ||= v
    }
    if (region || map || method) out.push({ region, map, subarea: '', method, levels, time, rate })
  })
  return out
}
function parseCatchRates($) {
  const text = $('body').text().replace(/\s+/g, ' ')
  const out = {}
  for (const b of BALLS) {
    const m = text.match(b.re); if (!m) continue
    const slice = text.slice(m.index, m.index + 1500)
    const pick = (label) => slice.match(new RegExp(label + '\\s*:??\\s*(\\d+\\s*%)', 'i'))?.[1] || null
    const fullHp = pick('Full\\s*HP') || pick('FullHP')
    const oneHp = pick('1\\s*HP') || pick('1HP')
    const asleep = pick('Asleep')
    if (fullHp || oneHp || asleep) out[b.key] = { fullHp, oneHp, asleep }
  }
  return out
}

async function getRenderedHTML(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await clickButtonsByText(page, ['accept', 'agree', 'ok', 'continue'])
  await deepScroll(page)
  return await page.content()
}

async function main() {
  const args = process.argv.slice(2)
  const i = args.indexOf('--species')
  const filter = i >= 0 ? (args[i + 1] || '').toLowerCase() : null

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1360, height: 900 },
  })
  const page = await browser.newPage()
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36')

  // 1) Render index and extract links
  const indexHtml = await getRenderedHTML(page, INDEX_URL)
  const $ = cheerio.load(indexHtml)
  const entries = []
  $('a[href*="/tools/pokedex/"]').each((_, a) => {
    const href = $(a).attr('href') || ''
    const m = href.match(/\/tools\/pokedex\/([^/?#]+)\/?$/)
    if (!m) return
    const slug = m[1]
    const text = ($(a).text() || '').trim()
    entries.push({ slug, href: new URL(href, INDEX_URL).toString(), text })
  })
  console.log('[ingest] index links:', entries.length)

  let list = entries
  if (filter) {
    const best = entries.find(e => (e.text || '').toLowerCase().includes(filter) || (e.slug || '').toLowerCase().includes(filter))
    if (!best) { console.warn('[ingest] no species match for', filter); await browser.close(); return }
    list = [best]
    console.log('[ingest] resolved:', best.slug, '→', best.href, 'text=', best.text)
  }

  const db = {}
  let n = 0
  for (const e of list) {
    n++
    try {
      console.log(`[ingest] fetch ${n}/${list.length}:`, e.href)
      const html = await getRenderedHTML(page, e.href)
      const $p = cheerio.load(html)
      const id = parseDexId($p)
      if (!id || id > LIMIT_GEN_MAX_ID) { console.log('[ingest] skip (id out of range):', e.slug, id); continue }
      const locations = parseLocations($p)
      const catchRates = parseCatchRates($p)
      const key = (e.text || '').trim().toLowerCase()
      db[key] = { locations, catchRates }
      db[String(id)] = db[key]
      console.log(`[ingest] + #${id} ${key}  loc:${locations.length}  balls:${Object.keys(catchRates).length}`)
    } catch (err) {
      console.warn('[ingest] error', e.slug, err.message)
    }
  }

  await browser.close()
  await fs.promises.writeFile(OUT, JSON.stringify(db, null, 2))
  console.log('[ingest] wrote', OUT, 'entries:', Object.keys(db).length)
}
main().catch(e => { console.error(e); process.exit(1) })
