/**
 * Migration script to convert new data format to UpdatedDex.json format
 *
 * Changes in new format:
 * - exp_type is numeric (3) instead of string ("MEDIUM_SLOW")
 * - move types use different names:
 *   - "EGG" instead of "egg_moves"
 *   - "TUTOR" instead of "move_tutor"
 *   - "TM??" instead of "move_learner_tools"
 * - items.json has different field names (desc vs description)
 */

const fs = require('fs');
const path = require('path');

// Experience type mapping (numeric to string)
const EXP_TYPE_MAP = {
  0: 'FAST',
  1: 'MEDIUM_FAST',
  2: 'MEDIUM_SLOW',
  3: 'MEDIUM_SLOW',
  4: 'SLOW',
  5: 'ERRATIC',
  6: 'FLUCTUATING'
};

// Move type mapping (new format to old format)
const MOVE_TYPE_MAP = {
  'level': 'level',
  'EGG': 'egg_moves',
  'TUTOR': 'move_tutor',
  'TM??': 'move_learner_tools',
};

function convertMoveType(type) {
  // Handle TM variations
  if (type && type.startsWith('TM')) {
    return 'move_learner_tools';
  }
  return MOVE_TYPE_MAP[type] || type;
}

function convertExpType(expType) {
  if (typeof expType === 'string') {
    return expType; // Already in string format
  }
  return EXP_TYPE_MAP[expType] || 'MEDIUM_FAST';
}

function convertMonster(mon) {
  return {
    id: mon.id,
    name: mon.name,
    exp_type: convertExpType(mon.exp_type),
    obtainable: mon.obtainable,
    gender_ratio: mon.gender_ratio,
    height: mon.height,
    weight: mon.weight,
    egg_groups: mon.egg_groups || [],
    abilities: mon.abilities || [],
    forms: mon.forms || [],
    evolutions: mon.evolutions || [],
    moves: (mon.moves || []).map(move => ({
      id: move.id,
      name: move.name,
      type: convertMoveType(move.type),
      ...(move.level !== undefined && { level: move.level })
    })),
    types: mon.types || [],
    stats: mon.stats || {},
    yields: mon.yields || {},
    tiers: mon.tiers || [],
    held_items: mon.held_items || [],
    locations: mon.locations || []
  };
}

function convertItems(items) {
  return items.map(item => ({
    id: item.id,
    type: item.type || 0,
    name: item.name,
    description: item.desc || item.description || ''
  }));
}

async function main() {
  console.log('Starting data migration...');

  // Read new data files
  const monstersPath = path.join(__dirname, '..', 'data', 'monsters.json');
  const movesPath = path.join(__dirname, '..', 'data', 'moves.json');
  const itemsPath = path.join(__dirname, '..', 'data', 'items.json');

  console.log('Reading monsters.json...');
  const monsters = JSON.parse(fs.readFileSync(monstersPath, 'utf8'));

  console.log('Reading items.json...');
  const items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));

  // Convert monsters
  console.log('Converting monsters data...');
  const convertedMonsters = monsters.map(convertMonster);

  // Convert items
  console.log('Converting items data...');
  const convertedItems = convertItems(items);

  // Write UpdatedDex.json
  const updatedDexPath = path.join(__dirname, '..', 'UpdatedDex.json');
  console.log('Writing UpdatedDex.json...');
  fs.writeFileSync(updatedDexPath, JSON.stringify(convertedMonsters, null, 2));

  // Write itemdata.json
  const itemDataPath = path.join(__dirname, '..', 'itemdata.json');
  console.log('Writing itemdata.json...');
  fs.writeFileSync(itemDataPath, JSON.stringify(convertedItems, null, 4));

  console.log('Migration complete!');
  console.log(`- Converted ${convertedMonsters.length} monsters`);
  console.log(`- Converted ${convertedItems.length} items`);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
