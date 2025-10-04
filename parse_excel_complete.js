const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const excelPath = path.join(__dirname, 'data', 'Region_Pokedex_Info.xlsx');

console.log('Reading Excel file:', excelPath);

const workbook = XLSX.readFile(excelPath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

console.log('Sheet name:', sheetName);
console.log('Sheet range:', worksheet['!ref']);

// Get the range of the worksheet
const range = XLSX.utils.decode_range(worksheet['!ref']);
console.log('Rows:', range.s.r, 'to', range.e.r);
console.log('Columns:', range.s.c, 'to', range.e.c);

// Convert to JSON with header row
const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

console.log('\nTotal rows found:', jsonData.length);
console.log('\nFirst few rows:');
for (let i = 0; i < Math.min(10, jsonData.length); i++) {
  console.log(`Row ${i}:`, jsonData[i]);
}

// Parse the data structure
const pokemonData = {};

// Find header row
let headerRowIndex = -1;
for (let i = 0; i < jsonData.length; i++) {
  const row = jsonData[i];
  if (row.some(cell => typeof cell === 'string' && cell.toLowerCase().includes('pokemon'))) {
    headerRowIndex = i;
    console.log('\nFound header at row:', i);
    console.log('Header:', row);
    break;
  }
}

if (headerRowIndex === -1) {
  console.log('\nNo explicit header found. Analyzing structure...');
  // Try to detect the structure from the first rows
  for (let i = 0; i < Math.min(20, jsonData.length); i++) {
    console.log(`Row ${i} length: ${jsonData[i].length}, content:`, jsonData[i]);
  }
}

// Parse all rows thoroughly
console.log('\n=== PARSING ALL DATA ===\n');

let currentPokemon = null;
let pokemonCount = 0;

for (let rowIndex = 0; rowIndex < jsonData.length; rowIndex++) {
  const row = jsonData[rowIndex];

  // Skip completely empty rows
  if (!row || row.length === 0 || row.every(cell => cell === '' || cell === null || cell === undefined)) {
    continue;
  }

  // Check if this row starts with a Pokemon name (non-numeric first cell)
  const firstCell = row[0];

  if (firstCell && typeof firstCell === 'string' && firstCell.trim() !== '') {
    // This looks like a Pokemon name
    currentPokemon = firstCell.trim();

    if (!pokemonData[currentPokemon]) {
      pokemonData[currentPokemon] = {};
      pokemonCount++;
    }

    console.log(`\nRow ${rowIndex}: Found Pokemon: "${currentPokemon}"`);
    console.log(`  Full row:`, row);

    // Parse the regional dex numbers from this row
    // Expected format: [Pokemon Name, Kanto#, Johto#, Hoenn#, Sinnoh#, Unova#]
    // Or possibly with headers in between

    for (let colIndex = 1; colIndex < row.length; colIndex++) {
      const cell = row[colIndex];
      if (cell !== '' && cell !== null && cell !== undefined) {
        // Try to determine which region this is
        // This might be based on column position or we need to check headers
        console.log(`    Column ${colIndex}: "${cell}" (type: ${typeof cell})`);
      }
    }
  } else {
    // This might be a continuation or header row
    console.log(`Row ${rowIndex}:`, row);
  }
}

console.log(`\n\nTotal Pokemon found: ${pokemonCount}`);
console.log('Pokemon names:', Object.keys(pokemonData).sort());

// Now let's try a different approach - look at the actual cell structure
console.log('\n=== DETAILED CELL ANALYSIS ===\n');

for (let row = range.s.r; row <= Math.min(range.s.r + 30, range.e.r); row++) {
  let rowData = [];
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
    const cell = worksheet[cellAddress];
    rowData.push(cell ? cell.v : '');
  }
  console.log(`Row ${row}:`, rowData);
}

// Save raw data for inspection
fs.writeFileSync('excel_raw_dump.json', JSON.stringify({
  sheetName,
  range: worksheet['!ref'],
  jsonData,
  allCells: Object.keys(worksheet).filter(k => k[0] !== '!').reduce((acc, key) => {
    acc[key] = worksheet[key].v;
    return acc;
  }, {})
}, null, 2));

console.log('\nRaw data saved to excel_raw_dump.json');
