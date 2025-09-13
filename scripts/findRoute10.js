const fs = require('fs');

function loadJson(path){
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

const dex = loadJson('UpdatedDex.json');

function findByNameAndRoute(nameRe, regionName='Kanto', route='Route 10'){
  const out = [];
  for (const m of dex){
    if (!nameRe.test(m.name)) continue;
    const hits = (m.locations||[]).filter(l =>
      new RegExp(route, 'i').test(l.location||'') &&
      new RegExp(regionName, 'i').test(l.region_name||'')
    ).map(l => ({ type: l.type, location: l.location, region: l.region_name, rarity: l.rarity, min: l.min_level, max: l.max_level }));
    if (hits.length) out.push({ id:m.id, name:m.name, hits });
  }
  return out;
}

console.log('Elekid@Kanto Route 10:', JSON.stringify(findByNameAndRoute(/Elekid/i), null, 2));
console.log('Dratini@Kanto Route 10:', JSON.stringify(findByNameAndRoute(/Dratini/i), null, 2));

