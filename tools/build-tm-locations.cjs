const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '../TM Locations');
const outFile = path.resolve(__dirname, '../public/data/tm_locations.json');

const regions = {};
for (const file of fs.readdirSync(srcDir)) {
  if (!file.toLowerCase().endsWith('.txt')) continue;
  const region = file.replace(/\.txt$/i, '');
  const text = fs.readFileSync(path.join(srcDir, file), 'utf8');
  const lines = text.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const tmMatch = line.match(/^TM\s*-\s*(.+)$/i);
    if (tmMatch) {
      current = { tm: tmMatch[1].trim(), location: '' };
      if (!regions[region]) regions[region] = [];
      regions[region].push(current);
      continue;
    }
    const locMatch = line.match(/^Location:\s*(.+)$/i);
    if (locMatch && current) {
      current.location = locMatch[1].trim();
    }
  }
}
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(regions, null, 2));