const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const POKEDEX_URL = 'https://pokemmohub.com/tools/pokedex/';
  const TARGET_JSON = 'locations.json';
  const MAX_DEX = 649; // Stop at gen 5

  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(POKEDEX_URL, { waitUntil: 'domcontentloaded' });

  const output = {};

  for (let i = 1; i <= MAX_DEX; i++) {
    try {
      const selector = `#pokedex-entry-${i}`;
      await page.waitForSelector(selector, { timeout: 3000 });
      const isCollapsed = await page.$eval(selector, el =>
        el.querySelector('.accordion-collapse.collapse:not(.show)')
      );
      if (isCollapsed) {
        await page.click(`${selector} .accordion-button`);
        await page.waitForTimeout(500);
      }

      const raw = await page.evaluate((sel) => {
        const entry = document.querySelector(sel);
        const name = entry.querySelector('.accordion-button').innerText.trim();

        const locationTable = entry.querySelector('table.table tbody');
        const locations = [];
        if (locationTable) {
          for (const row of locationTable.querySelectorAll('tr')) {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
              const area = cells[0].innerText.trim();
              const method = cells[1].innerText.trim();
              locations.push({ area, method });
            }
          }
        }

        const rateDiv = entry.querySelector('.catch-rate-table');
        let rates = null;
        if (rateDiv) {
          const rows = rateDiv.querySelectorAll('tbody tr');
          for (const row of rows) {
            const ball = row.querySelector('td')?.innerText?.trim();
            if (ball === 'Poké Ball') {
              const values = [...row.querySelectorAll('td')].slice(1).map(td => td.innerText.trim());
              rates = {
                fullHp: values[0],
                oneHp: values[1],
                fullHpAsleep: values[2],
                oneHpAsleep: values[3],
              };
              break;
            }
          }
        }

        return {
          name,
          locations,
          rates,
        };
      }, selector);

      // Only add if we got both sets of data
      if (raw.locations.length && raw.rates) {
        output[raw.name] = {
          locations: raw.locations,
          rates: raw.rates,
        };
        console.log(`✔️ ${raw.name} - data saved`);
      } else {
        console.log(`⚠️ ${raw.name} - missing data`);
      }

      await page.waitForTimeout(300); // brief delay between scrolls
    } catch (err) {
      console.log(`❌ Error with dex ${i}: ${err.message}`);
    }
  }

  fs.writeFileSync(TARGET_JSON, JSON.stringify(output, null, 2));
  console.log(`✅ Saved to ${TARGET_JSON}`);
  await browser.close();
})();
