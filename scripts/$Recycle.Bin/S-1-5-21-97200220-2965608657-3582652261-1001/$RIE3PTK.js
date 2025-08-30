
// tools/test-fetch-index.js — quick diagnostics
import fs from 'fs'
import path from 'path'
import * as cheerio from 'cheerio'

const INDEX = 'https://pokemmohub.com/tools/pokedex/'
const UA = 'weakness-finder/diag'
const CACHE = path.join(process.cwd(), '.cache', 'pokemmohub', '__index__.html')
await fs.promises.mkdir(path.dirname(CACHE), { recursive: true })

const fetchImpl = globalThis.fetch ? globalThis.fetch : (await import('node-fetch')).default

console.log('[diag] fetching index…', INDEX)
const r = await fetchImpl(INDEX, { headers: { 'User-Agent': UA } })
console.log('[diag] status', r.status, r.statusText)
const html = await r.text()
console.log('[diag] length', html.length)
await fs.promises.writeFile(CACHE, html)

const $ = cheerio.load(html)
const links = []
$('a[href^="/tools/pokedex/"]').each((_,a)=>{
  const href = $(a).attr('href') || ''
  const m = href.match(/^\/tools\/pokedex\/([^?#/]+)\/?/)
  if (m) links.push(m[1])
})
console.log('[diag] found links:', links.slice(0,10))
console.log('[diag] total links:', links.length)
