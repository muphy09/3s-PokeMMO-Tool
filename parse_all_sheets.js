const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const excelPath = path.join(__dirname, 'data', 'Region_Pokedex_Info.xlsx');

console.log('Reading Excel file:', excelPath);

const workbook = XLSX.readFile(excelPath);

console.log('Sheets found:', workbook.SheetNames);

const allPokemonData = {};

// Process each sheet
workbook.SheetNames.forEach(sheetName => {
  console.log(`\n=== Processing ${sheetName} sheet ===`);

  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  console.log(`Total rows in ${sheetName}:`, jsonData.length);

  let currentPokemon = null;
  let pokemonCount = 0;

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

        if (!allPokemonData[currentPokemon]) {
          allPokemonData[currentPokemon] = {};
        }

        allPokemonData[currentPokemon][region] = number;
      }
    } else {
      // This is a Pokemon name
      currentPokemon = cellStr;
      if (!allPokemonData[currentPokemon]) {
        pokemonCount++;
      }
    }
  }

  console.log(`Pokemon found in ${sheetName}:`, pokemonCount);
});

console.log(`\n\nTotal unique Pokemon found: ${Object.keys(allPokemonData).length}`);

// Sort by National dex number
const sortedPokemon = Object.entries(allPokemonData)
  .filter(([name, data]) => data.National !== undefined)
  .sort((a, b) => a[1].National - b[1].National);

console.log('\nFirst 30 Pokemon:');
sortedPokemon.slice(0, 30).forEach(([name, data]) => {
  console.log(`${name} (National #${data.National}): Kanto: ${data.Kanto || '-'}, Johto: ${data.Johto || '-'}, Hoenn: ${data.Hoenn || '-'}, Sinnoh: ${data.Sinnoh || '-'}, Unova: ${data.Unova || '-'}`);
});

// Check for Aipom specifically
console.log('\n=== Checking for Aipom ===');
if (allPokemonData['Aipom']) {
  console.log('Aipom found:');
  console.log(allPokemonData['Aipom']);
} else {
  console.log('Aipom NOT found!');
  // Search for similar names
  const names = Object.keys(allPokemonData);
  const similarNames = names.filter(name => name.toLowerCase().includes('aip'));
  console.log('Similar names:', similarNames);
}

// Check for Pokemon with Johto #127
console.log('\n=== Pokemon with Johto #127 ===');
const johto127 = Object.entries(allPokemonData).filter(([name, data]) => data.Johto === 127);
console.log(johto127);

// Output the complete JSON
const output = JSON.stringify(allPokemonData, null, 2);
fs.writeFileSync('pokemon_regional_dex_complete.json', output);

console.log('\n\n=== COMPLETE JSON OUTPUT ===\n');
console.log(output);

console.log('\n\nData saved to pokemon_regional_dex_complete.json');
console.log(`Total Pokemon in output: ${Object.keys(allPokemonData).length}`);
