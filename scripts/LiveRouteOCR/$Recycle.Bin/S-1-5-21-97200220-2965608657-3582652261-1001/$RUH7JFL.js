// tools/build-offline.js — fetches full dex + sprites (one-time, online)
import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'

const OUT_DATA = path.join(process.cwd(), 'src')
const OUT_SPRITES = path.join(process.cwd(), 'public', 'sprites')
const OUT_JSON = path.join(OUT_DATA, 'pokedex.json')
fs.mkdirSync(OUT_SPRITES, { recursive: true })

function sleep(ms){ return new Promise(res => setTimeout(res, ms)) }
async function fetchJSON(url) {
  const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json()
}
async function download(url, outFile) {
  const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const buf = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(outFile, buf)
}

;(async () => {
  console.log('Fetching Pokémon list…')
  const list = await fetchJSON('https://pokeapi.co/api/v2/pokemon?limit=2000')
  const names = list.results.map(x => x.name)
  const db = {}
  let i = 0
  for (const name of names) {
    i++
    try {
      const p = await fetchJSON(`https://pokeapi.co/api/v2/pokemon/${name}`)
      const id = p.id
      const types = p.types.map(t => t.type.name)
      db[name] = { id, name, types, sprite: `./sprites/${id}.png` }
      const art = p.sprites?.other?.['official-artwork']?.front_default
      if (art) {
        const outPng = path.join(OUT_SPRITES, `${id}.png`)
        if (!fs.existsSync(outPng)) {
          await download(art, outPng)
          await sleep(50)
        }
      }
      if (i % 50 === 0) console.log(`Processed ${i}/${names.length}`)
    } catch (e) {
      console.warn('Skip', name, e.message)
    }
  }
  fs.writeFileSync(OUT_JSON, JSON.stringify(db, null, 2))
  console.log('Wrote', OUT_JSON, 'and sprites in', OUT_SPRITES)
})()