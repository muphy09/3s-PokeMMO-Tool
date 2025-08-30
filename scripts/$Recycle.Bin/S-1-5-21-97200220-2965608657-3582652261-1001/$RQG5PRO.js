// Diagnostic: robust scroll + click "load more" + dump artifacts
import puppeteer from 'puppeteer'
import * as cheerio from 'cheerio'
import fs from 'fs'
import path from 'path'

const OUTDIR = path.join(process.cwd(), '.cache', 'pokemmohub')
await fs.promises.mkdir(OUTDIR, { recursive: true })

const URL = 'https://pokemmohub.com/tools/pokedex/'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

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

// Scroll until no height change for 3 cycles or max tries
async function deepScroll(page, {maxLoops = 80, settleCycles = 3} = {}) {
  let lastHeight = 0, sameCount = 0
  for (let i = 0; i < maxLoops; i++) {
    // try to reveal lazy areas + any “load more” buttons on screen
    await clickButtonsByText(page, ['load more', 'show more', 'view more', 'view all', 'see more', 'more'])
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.9))
    await sleep(450)

    const h = await page.evaluate(() => document.scrollingElement ? document.scrollingElement.scrollHeight : document.body.scrollHeight)
    if (h === lastHeight) {
      sameCount++
      if (sameCount >= settleCycles) break
    } else {
      sameCount = 0
      lastHeight = h
    }

    // occasionally jump to bottom to force lazy loaders
    if (i % 8 === 7) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await sleep(600)
    }
  }
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1360, height: 900 },
  })
  const page = await browser.newPage()
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
  )

  console.log('[diag] goto…', URL)
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 })

  // best-effort consent
  await clickButtonsByText(page, ['accept', 'agree', 'ok', 'continue'])
  await sleep(1000)

  // robust scroll
  await deepScroll(page, { maxLoops: 120, settleCycles: 4 })

  // Save artifacts
  const html = await page.content()
  await fs.promises.writeFile(path.join(OUTDIR, '__index_rendered__.html'), html)
  await page.screenshot({ path: path.join(OUTDIR, '__index_screenshot__.png'), fullPage: true })

  // Parse slugs
  const $ = cheerio.load(html)
  const slugs = []
  $('a[href*="/tools/pokedex/"]').each((_, a) => {
    const href = $(a).attr('href') || ''
    const m = href.match(/\/tools\/pokedex\/([^/?#]+)\/?$/)
    if (m) slugs.push(m[1])
  })

  console.log('[diag] slugs found:', slugs.length, slugs.slice(0, 12))
  await browser.close()
})().catch(e => { console.error(e); process.exit(1) })
