// tools/scrape_pokemmohub_list.cjs
// PokéMMO Hub Pokédex sweeper: expands & extracts Locations + Catch Rates (Gen 1–5)
// - URL: https://pokemmohub.com/tools/pokedex/
// - Headless by default; pass --headful to watch.
// - Output: public/data/pokemmo_locations.json

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const BASE_URL = 'https://pokemmohub.com/tools/pokedex/';
const OUT_FILE = path.join(process.cwd(), 'public', 'data', 'pokemmo_locations.json');
const ROSTER_FILE = path.join(process.cwd(), 'public', 'data', 'gen1to5_full_list.json'); // optional filter

const HEADFUL = process.argv.includes('--headful');
const DEBUG   = process.argv.includes('--debug');

const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
const low   = (s)=> (s==null?'':String(s)).toLowerCase().trim();

function loadRosterSet() {
  try {
    if (fs.existsSync(ROSTER_FILE)) {
      const arr = JSON.parse(fs.readFileSync(ROSTER_FILE,'utf8'));
      const set = new Set();
      for (const x of arr) if (x.dex >= 1 && x.dex <= 649) set.add(x.name);
      return set;
    }
  } catch {}
  return new Set(); // empty = accept all names
}

async function setup(page) {
  await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on('request', req => {
    const t = req.resourceType();
    if (t === 'image' || t === 'media' || t === 'font') return req.abort();
    req.continue();
  });
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome Safari/537.36');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('h4', { timeout: 60000 });
}

/* ---------- client-side functions executed inside the page ---------- */

function clientExpandAndExtract(rosterSetJSON) {
  const roster = rosterSetJSON ? new Set(JSON.parse(rosterSetJSON)) : null;

  const inView = (el)=>{
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth  || document.documentElement.clientWidth;
    return r.top < vh*0.92 && r.bottom > vh*0.08 && r.left < vw && r.right > 0;
  };

  // Click helper: pure JS (no TS casts)
  const safeClick = (b)=>{
    try {
      b.scrollIntoView({behavior:'instant', block:'center'});
    } catch {}
    try {
      if (typeof b.click === 'function') b.click();
      else b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    } catch {}
  };

  // Find cards (h4 name + buttons in the same container)
  const cards = [];
  for (const h of Array.from(document.querySelectorAll('h4'))) {
    const name = (h.textContent||'').trim();
    if (!name || !inView(h)) continue;
    if (roster && !roster.has(name)) continue;

    // climb a few levels to find container holding both buttons
    let node = h;
    for (let i=0;i<6 && node;i++) {
      const btns = node.querySelectorAll?.('button,[role="button"]');
      if (btns && Array.from(btns).some(b => {
        const t = (b.textContent||'').toLowerCase();
        return t.includes('locations') || t.includes('catch rates');
      })) {
        // expand both if present
        Array.from(btns).forEach(b => {
          const t = (b.textContent||'').toLowerCase();
          if (t.includes('locations') || t.includes('catch rates')) safeClick(b);
        });
        cards.push({ name, card: node });
        break;
      }
      node = node.parentElement;
    }
  }

  // Parsing helpers (work within a single card)
  const parseLocations = (card)=>{
    // locate the panel in this card containing 'Region/Route/Rarity/Type/Level' columns
    const panels = Array.from(card.querySelectorAll('.overflow-scroll'));
    let panel = null;
    for (const p of panels) {
      const t = (p.innerText||'').toLowerCase();
      if (t.includes('region') && t.includes('route') && t.includes('rarity')) { panel = p; break; }
    }
    if (!panel) return [];

    // columns appear as .d-flex.flex-column with <b>Label</b> then many values
    const cols = Array.from(panel.querySelectorAll('.d-flex.flex-column'))
      .map(col => {
        const label = (col.querySelector('b')?.innerText || '').trim();
        return {
          label,
          values: Array.from(col.querySelectorAll('.position-relative, div, span'))
            .map(x => (x.innerText||'').trim())
            .filter(Boolean)
            .filter(v => v !== label)
        };
      })
      .filter(c => /^(Region|Route|Rarity|Type|Level)$/i.test(c.label));

    if (cols.length < 5) return [];

    const rowCount = Math.max(...cols.map(c => c.values.length));
    const rows = [];
    for (let i=0;i<rowCount;i++){
      const get = (lab)=>{
        const c = cols.find(x => x.label.toLowerCase() === lab);
        return c && c.values[i] ? c.values[i] : '';
      };
      rows.push({
        region: get('region'),
        map:    get('route'),
        rarity: get('rarity'),
        type:   get('type'),
        level:  get('level')
      });
    }
    return rows;
  };

  const parseCatch = (card)=>{
    // locate panel with "Full HP" and "1 HP" columns
    const panels = Array.from(card.querySelectorAll('.overflow-scroll'));
    let panel = null;
    for (const p of panels) {
      const t = (p.innerText||'').toLowerCase();
      if (t.includes('full hp') && (t.includes('1 hp') || t.includes('1hp'))) { panel = p; break; }
    }
    if (!panel) return null;

    const num = (s)=>{
      const m = String(s||'').match(/[0-9]+(?:\.[0-9]+)?\s*%/);
      return m ? parseFloat(m[0]) : null;
    };

    // find the two columns
    const allCols = Array.from(panel.querySelectorAll('.d-flex.flex-column'));
    let fullCol = null, oneCol = null;
    for (const c of allCols) {
      const lbl = (c.querySelector('b')?.innerText||'').toLowerCase();
      if (lbl.includes('full hp')) fullCol = c;
      if (lbl.includes('1 hp'))   oneCol  = c;
    }

    const firstCellVal = (col)=>{
      if (!col) return null;
      const cell = col.querySelector('.position-relative') || col;
      return num(cell.innerText || cell.textContent || '');
    };

    const full = firstCellVal(fullCol);
    const one  = firstCellVal(oneCol);
    if (full == null || one == null) return null;

    return {
      pokeball: {
        fullHp: full,
        oneHp: one,
        fullHpAsleep: full * 2,
        oneHpAsleep: one * 2
      }
    };
  };

  const out = [];
  for (const {name, card} of cards) {
    const locations = parseLocations(card);
    const catchRates = parseCatch(card);
    out.push({ name, locations, catchRates });
  }
  return out;
}

/* ------------------------------ main runner ------------------------------ */

(async () => {
  const rosterSet = loadRosterSet(); // optional filter (Gen 1–5)
  console.log(`[scrape] starting on ${BASE_URL}${rosterSet.size?` with ${rosterSet.size} filtered names`:''}`);

  const browser = await puppeteer.launch({
    headless: !HEADFUL,
    args: ['--no-sandbox','--disable-dev-shm-usage','--window-size=1400,1000']
  });
  const page = await browser.newPage();
  await setup(page);

  const db = fs.existsSync(OUT_FILE) ? JSON.parse(fs.readFileSync(OUT_FILE,'utf8')) : {};
  let lastY = 0, stagnant = 0, pass = 0;

  while (true) {
    pass++;

    const results = await page.evaluate(clientExpandAndExtract, JSON.stringify(Array.from(rosterSet)));
    let changed = 0;

    for (const r of results) {
      // skip if roster filter provided and name not in it
      if (rosterSet.size && !rosterSet.has(r.name)) continue;
      const key = low(r.name);

      const entry = {
        locations: Array.isArray(r.locations) ? r.locations : [],
        catchRates: r.catchRates || {}
      };

      const before = JSON.stringify(db[key] || {});
      const after  = JSON.stringify(entry);
      if (before !== after) {
        db[key] = entry;
        changed++;
      }
    }

    fs.writeFileSync(OUT_FILE, JSON.stringify(db, null, 2));
    console.log(`[pass ${pass}] updated ${changed} — total ${Object.keys(db).length}`);

    // scroll down ~90% viewport
    const y = await page.evaluate(()=>{
      const h = window.innerHeight || document.documentElement.clientHeight;
      window.scrollBy(0, Math.floor(h * 0.9));
      return window.scrollY || document.documentElement.scrollTop || 0;
    });

    if (y <= lastY + 10) stagnant++; else { stagnant = 0; lastY = y; }

    const hitBottom = stagnant >= 2;
    const allDone = rosterSet.size > 0 && Array.from(rosterSet).every(n => low(n) in db);
    if (hitBottom || allDone) break;

    await sleep(350); // let next viewport render
  }

  console.log(`[done] wrote ${OUT_FILE}`);
  await browser.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
