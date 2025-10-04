const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const excelPath = path.join(__dirname, 'data', 'Region_Pokedex_Info.xlsx');

console.log('Reading Excel file:', excelPath);

const workbook = XLSX.readFile(excelPath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Convert to JSON with header row
const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

console.log('Total rows:', jsonData.length);

// Parse the data structure
// Format: Pokemon Name, then following rows contain regional dex numbers
const pokemonData = {};
let currentPokemon = null;

for (let rowIndex = 0; rowIndex < jsonData.length; rowIndex++) {
  const row = jsonData[rowIndex];
  const cell = row[0];

  // Skip empty rows
  if (!cell || cell === '') {
    continue;
  }

  const cellStr = String(cell).trim();

  // Check if this is a regional dex entry
  if (cellStr.includes('#')) {
    const match = cellStr.match(/^(National|Kanto|Johto|Hoenn|Sinnoh|Unova)\s*#(\d+)$/);
    if (match && currentPokemon) {
      const region = match[1];
      const number = parseInt(match[2], 10);

      if (!pokemonData[currentPokemon]) {
        pokemonData[currentPokemon] = {};
      }

      pokemonData[currentPokemon][region] = number;
    }
  } else {
    // This is a Pokemon name
    currentPokemon = cellStr;
  }
}

console.log(`\nTotal Pokemon found: ${Object.keys(pokemonData).length}`);

// Sort by National dex number
const sortedPokemon = Object.entries(pokemonData)
  .filter(([name, data]) => data.National !== undefined)
  .sort((a, b) => a[1].National - b[1].National);

console.log('\nFirst 20 Pokemon:');
sortedPokemon.slice(0, 20).forEach(([name, data]) => {
  console.log(`${name}: National #${data.National}, Kanto: ${data.Kanto || 'N/A'}, Johto: ${data.Johto || 'N/A'}, Hoenn: ${data.Hoenn || 'N/A'}, Sinnoh: ${data.Sinnoh || 'N/A'}, Unova: ${data.Unova || 'N/A'}`);
});

// Check for Aipom specifically
if (pokemonData['Aipom']) {
  console.log('\nAipom found:');
  console.log(pokemonData['Aipom']);
} else {
  console.log('\nAipom NOT found!');
}

// Output the complete JSON
const output = JSON.stringify(pokemonData, null, 2);
fs.writeFileSync('pokemon_regional_dex.json', output);

console.log('\n\n=== COMPLETE JSON OUTPUT ===\n');
console.log(output);

console.log('\n\nData saved to pokemon_regional_dex.json');
console.log(`Total Pokemon in output: ${Object.keys(pokemonData).length}`);
