// Fix data issues in UpdatedDex.json that affect Area Search
// - Replace misencoded "Pokémon League" -> "Pokemon League"
// - Remove Dratini from Kanto Route 10
// - Remove Elekid Grass (Morning/Day) from Kanto Route 10, keep Lure only

const fs = require('fs');

function loadJson(path){
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}
function saveJson(path, obj){
  fs.writeFileSync(path, JSON.stringify(obj, null, 2));
}

function fixPokemonLeagueLabel(str){
  if (typeof str !== 'string') return str;
  // Normalize common misencodings of é -> "Ã©" or bytes encoded twice
  const bads = [
    'Pok\u00C3\u00A9mon League', // appears in raw JSON
    'PokÃ©mon League',
    'PokĂ©mon League'
  ];
  if (bads.includes(str)) return 'Pokemon League';
  return str;
}

function run(){
  const dex = loadJson('UpdatedDex.json');
  let changed = 0;

  for (const mon of dex){
    if (!Array.isArray(mon.locations)) continue;
    const name = mon.name || '';
    const before = mon.locations.length;
    const filtered = [];
    for (const loc of mon.locations){
      // Fix label
      if (typeof loc.location === 'string') {
        const fixed = fixPokemonLeagueLabel(loc.location);
        if (fixed !== loc.location) { loc.location = fixed; changed++; }
      }
      // Apply removals
      let drop = false;
      const region = (loc.region_name || '').toLowerCase();
      const map = String(loc.location || '');
      const type = String(loc.type || '');
      const rarity = String(loc.rarity || '');

      // Remove Dratini on Kanto Route 10
      if (/^dratini$/i.test(name) && region === 'kanto' && /^route\s*10/i.test(map)) {
        drop = true;
      }
      // Remove Elekid Grass (Morning/Day) on Kanto Route 10, keep Lure-only
      if (/^elekid$/i.test(name) && region === 'kanto' && /^route\s*10/i.test(map)){
        // keep the Lure entry (some data stores Lure in rarity)
        const isLure = /lure/i.test(type) || /lure/i.test(rarity);
        const isGrass = /grass/i.test(type);
        const hasTime = /\(.*(Morning|Day).*\)/i.test(map);
        if (isGrass && !isLure && hasTime) {
          drop = true;
        }
      }

      if (!drop) filtered.push(loc); else changed++;
    }
    if (filtered.length !== before) mon.locations = filtered;
  }

  if (changed) {
    saveJson('UpdatedDex.json', dex);
    console.log(`Applied ${changed} changes to UpdatedDex.json`);
  } else {
    console.log('No changes applied');
  }
}

if (require.main === module) run();

